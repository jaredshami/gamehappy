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
        
        // Verdict phase - who is on trial
        this.accusedPlayer = null;  // Current player being voted on in verdict phase
        this.verdictEliminatedPlayer = null;  // Track who was eliminated this verdict

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
        
        // Voting history - persists across entire game for results display
        // Structure: playerToken -> { roundVotes: { roundNumber -> { accused: targetToken, verdict: 'guilty'|'not-guilty' } } }
        this.votingHistory = {}; // Will be populated during game play
        
        // Eliminated players tracking
        this.eliminatedPlayers = new Set(); // playerToken -> player is eliminated
        
        // Game notes for all players
        this.gameNotes = [];
        
        // Body Guard protection tracking
        this.bodyGuardProtection = null; // playerToken of protected player
        this.lastProtectedPlayer = null; // Track who was protected last round
        this.lastWasSaved = false; // Track if someone was saved this round
        
        // Assassin voting for syndicate (who performs the kill)
        this.assassinVotes = new Map(); // playerToken -> assassinToken
        this.assassinVotesLocked = new Map(); // playerToken -> isLocked
        this.chosenAssassin = null; // Token of the chosen assassin for this round
        
        // Secret word/action system for Eye Witness and Detective
        this.secretWords = [
            'Scratches their nose', 'Clears their throat', 'Says "honestly"',
            'Looks at their hands', 'Takes a deep breath', 'Says "you know"',
            'Crosses their arms', 'Touches their ear', 'Says "actually"',
            'Taps the table', 'Looks up', 'Says "believe me"',
            'Adjusts glasses', 'Rubs their chin', 'Says "trust me"',
            'Shifts in seat', 'Looks away briefly', 'Says "obviously"'
        ];
        this.currentSecretWord = null; // The secret word for current round
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
        // Ensure eliminatedPlayers is initialized
        if (!this.eliminatedPlayers) {
            this.eliminatedPlayers = new Set();
        }
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
     * Check if game has ended and return win conditions
     * Returns null if game continues, otherwise returns { winner, winType, details }
     */
    checkWinConditions() {
        const alivePlayers = this.getAlivePlayers();
        const syndicateMembers = alivePlayers.filter(p => this.getPlayerRole(p.token) === 'Syndicate');
        const otherPlayers = alivePlayers.filter(p => this.getPlayerRole(p.token) !== 'Syndicate');
        
        console.log(`[${this.gameCode}] Checking win conditions: syndicate=${syndicateMembers.length}, other=${otherPlayers.length}`);
        
        // Condition 1: All syndicates eliminated - innocent players win
        if (syndicateMembers.length === 0 && alivePlayers.length > 0) {
            console.log(`[${this.gameCode}] GAME OVER: All syndicates eliminated! Innocent players win.`);
            return {
                winner: 'innocent',
                winType: 'ELIMINATED_SYNDICATES',
                details: {
                    message: 'All syndicates have been eliminated!',
                    syndicatesLeft: 0,
                    innocentLeft: otherPlayers.length
                }
            };
        }
        
        // Condition 2: Syndicates equal or outnumber other players - syndicates win
        // (They control the votes at 50% or more)
        if (syndicateMembers.length > 0 && syndicateMembers.length >= otherPlayers.length) {
            console.log(`[${this.gameCode}] GAME OVER: Syndicates control the votes! Syndicates win.`);
            return {
                winner: 'syndicate',
                winType: 'VOTE_CONTROL',
                details: {
                    message: 'Syndicates now control the majority and rule the votes!',
                    syndicatesLeft: syndicateMembers.length,
                    innocentLeft: otherPlayers.length
                }
            };
        }
        
        // Game continues
        return null;
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
                const nightResult = this.executeNightPhase();
                this.currentPhase = 'murder';
                
                // Check if someone was saved by body guard
                if (nightResult.wasSaved) {
                    console.log(`[${this.gameCode}] Body Guard saved the target - no victim this round`);
                    this.lastVictim = null;
                    this.lastMurderTarget = null;
                    this.murderEliminatedPlayer = null;
                    // Generate the saved story
                    this.currentPhaseStory = this.getMurderStory();
                    console.log(`[${this.gameCode}] Saved story generated: ${this.currentPhaseStory}`);
                }
                // Check if there was a tie vote (no elimination)
                else if (nightResult.isTie) {
                    console.log(`[${this.gameCode}] Syndicate vote tied - no victim this round`);
                    this.lastVictim = null;
                    this.lastMurderTarget = null;
                    this.murderEliminatedPlayer = null;
                    // Generate the tie story
                    this.currentPhaseStory = this.getMurderStory();
                    console.log(`[${this.gameCode}] Tie story generated: ${this.currentPhaseStory}`);
                } else if (this.lastMurderTarget) {
                    // Now set lastVictim from lastMurderTarget
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
                    // No votes at all - this shouldn't happen in normal gameplay
                    // but handle gracefully by just not having a victim
                    console.log(`[${this.gameCode}] No syndicate votes cast - no victim this round`);
                    this.lastVictim = null;
                    this.murderEliminatedPlayer = null;
                    this.currentPhaseStory = this.getMurderStory();
                }
                this.playersReady.clear();
                
                // Check win conditions after night phase (someone may have been assassinated)
                const nightWinResult = this.checkWinConditions();
                if (nightWinResult) {
                    console.log(`[${this.gameCode}] Game ended after assassination: ${nightWinResult.winner} wins`);
                    this.currentPhase = 'ended';
                    return {
                        success: true,
                        phase: 'murder', // Still show murder phase first
                        previousPhase: previousPhase,
                        round: this.currentRound,
                        gameEnded: true,
                        winCondition: nightWinResult
                    };
                }
                break;
            case 'murder':
                this.currentPhase = 'trial';
                break;
            case 'trial':
                this.currentPhase = 'accusation';
                break;
            case 'accusation':
                // Execute accusation votes (counts votes, generates rumors for 2+ accusations, returns most voted)
                this.accusedPlayer = this.executeAccusationVotes();
                console.log(`[${this.gameCode}] Accusation phase complete - accusedPlayer: ${this.accusedPlayer}`);
                
                // Advance to verdict phase
                this.currentPhase = 'verdict';
                break;
            case 'verdict':
                // Execute verdict votes: check if majority voted guilty
                const guiltVotes = Array.from(this.trialVotes.values()).filter(v => v === 'guilty').length;
                const totalVotes = this.trialVotes.size;
                const majorityVotedGuilty = guiltVotes > totalVotes / 2;
                
                // Track the newly eliminated player for the verdict phase
                this.verdictEliminatedPlayer = null;
                
                const accusedRole = this.accusedPlayer ? this.getPlayerRole(this.accusedPlayer) : 'UNKNOWN';
                console.log(`[${this.gameCode}] VERDICT PHASE: accusedPlayer=${this.accusedPlayer} (role: ${accusedRole}), guiltVotes=${guiltVotes}, totalVotes=${totalVotes}, majorityGuilty=${majorityVotedGuilty}`);
                
                if (majorityVotedGuilty && this.accusedPlayer) {
                    // Majority voted guilty - eliminate the accused player
                    // ALWAYS eliminate, regardless of role
                    console.log(`[${this.gameCode}] BEFORE ELIMINATION: eliminatedPlayers=${Array.from(this.eliminatedPlayers).join(', ')}`);
                    this.eliminatedPlayers.add(this.accusedPlayer);
                    this.verdictEliminatedPlayer = this.accusedPlayer;
                    console.log(`[${this.gameCode}] Player ${this.accusedPlayer} (${accusedRole}) eliminated by guilty verdict (${guiltVotes}/${totalVotes} votes)`);
                    console.log(`[${this.gameCode}] AFTER ELIMINATION: eliminatedPlayers=${Array.from(this.eliminatedPlayers).join(', ')}`);
                } else if (this.accusedPlayer) {
                    console.log(`[${this.gameCode}] Player ${this.accusedPlayer} (${accusedRole}) acquitted (${guiltVotes}/${totalVotes} votes for guilty)`);
                } else {
                    console.log(`[${this.gameCode}] VERDICT: No accused player set! Cannot eliminate.`);
                }
                
                // Check win conditions after every verdict
                const winResult = this.checkWinConditions();
                
                // End game if:
                // 1. Win condition is met (syndicates eliminated or they control votes), OR
                // 2. We've reached round 5 (final round)
                if (winResult || this.currentRound === 5) {
                    console.log(`[${this.gameCode}] Game ended after round ${this.currentRound}: ${winResult ? winResult.winner : 'Round limit'} wins`);
                    this.currentPhase = 'ended';
                    return {
                        success: true,
                        phase: this.currentPhase,
                        previousPhase: previousPhase,
                        round: this.currentRound,
                        gameEnded: true,
                        winCondition: winResult
                    };
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
            round: this.currentRound,
            gameEnded: false,
            winCondition: null
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
        
        // Return syndicate recommendations for real-time updates
        return { 
            success: true, 
            message: 'Vote recorded',
            syndicateUpdate: true,
            recommendations: this.getSyndicateRecommendations()
        };
    }

    /**
     * Get current syndicate recommendations for real-time display
     */
    getSyndicateRecommendations() {
        const recommendations = [];
        const voteCounts = {};
        const lockedIn = [];
        
        // Get all syndicate members
        const syndicateMembers = this.getSyndicateMembers();
        
        for (const [voterToken, targetToken] of this.nightVotes) {
            const voter = this.players.get(voterToken);
            const target = this.players.get(targetToken);
            
            if (voter && target) {
                recommendations.push({
                    voterId: voterToken,
                    voterName: voter.name,
                    targetId: targetToken,
                    targetName: target.name
                });
                
                voteCounts[targetToken] = (voteCounts[targetToken] || 0) + 1;
            }
        }
        
        // Track who has locked in
        for (const [token, locked] of this.nightVotesLocked) {
            if (locked) {
                lockedIn.push(token);
            }
        }
        
        return {
            recommendations,
            voteCounts,
            lockedIn,
            totalSyndicates: syndicateMembers.length,
            lockedInCount: lockedIn.length
        };
    }

    /**
     * Lock in night votes
     */
    lockNightVotes(playerToken) {
        if (this.getPlayerRole(playerToken) !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can lock votes' };
        }

        this.nightVotesLocked.set(playerToken, true);
        
        // Return syndicate update info
        const recommendations = this.getSyndicateRecommendations();
        return { 
            success: true,
            syndicateUpdate: true,
            recommendations: recommendations,
            allLocked: this.allSyndicateLocked()
        };
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

        // Find target with most votes and check for ties
        let target = null;
        let maxVotes = 0;
        let tiedTargets = [];
        
        for (const [playerToken, voteCount] of votes) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                target = playerToken;
                tiedTargets = [playerToken];
            } else if (voteCount === maxVotes) {
                tiedTargets.push(playerToken);
            }
        }

        // Check for tie - if more than one target has the max votes, no elimination
        const isTie = tiedTargets.length > 1;
        
        // Reset saved status
        this.lastWasSaved = false;
        this.lastProtectedPlayer = this.bodyGuardProtection;
        
        if (isTie) {
            // Tie vote - no one is eliminated
            console.log(`[${this.gameCode}] Syndicate vote tied between ${tiedTargets.length} targets - no elimination this round`);
            target = null;
            this.lastMurderTarget = null;
            this.lastMurderAssassin = null;
            this.chosenAssassin = null;
        } else if (target) {
            // Determine the assassin from votes (or random if single syndicate)
            this.determineAssassin();
            
            // Check if target is protected by body guard
            if (this.bodyGuardProtection && this.bodyGuardProtection === target) {
                // Target was saved!
                console.log(`[${this.gameCode}] Body Guard saved ${this.players.get(target).name} from assassination!`);
                this.lastWasSaved = true;
                this.lastMurderTarget = null; // No one dies
                this.lastMurderAssassin = this.chosenAssassin;
            } else {
                this.lastMurderTarget = target;
                this.lastMurderAssassin = this.chosenAssassin;
            }
        }
        
        // Generate secret word for eye witness / detective system
        this.generateSecretWord();
        
        // Clear night phase data
        this.nightVotes.clear();
        this.nightVotesLocked.clear();
        this.assassinVotes.clear();
        this.assassinVotesLocked.clear();
        this.bodyGuardProtection = null; // Reset for next round

        return { 
            success: true, 
            target: this.lastMurderTarget,
            assassin: this.lastMurderAssassin,
            isTie: isTie,
            tiedTargets: isTie ? tiedTargets : [],
            wasSaved: this.lastWasSaved,
            protectedPlayer: this.lastProtectedPlayer
        };
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
     * Body Guard sets protection for a player
     */
    setBodyGuardProtection(playerToken, targetToken) {
        const role = this.getPlayerRole(playerToken);
        if (role !== 'Body Guard') {
            return { success: false, message: 'Only Body Guard can protect players' };
        }
        
        if (!this.players.has(targetToken)) {
            return { success: false, message: 'Invalid target' };
        }
        
        // Can't protect yourself
        if (targetToken === playerToken) {
            return { success: false, message: 'Cannot protect yourself' };
        }
        
        this.bodyGuardProtection = targetToken;
        const targetPlayer = this.players.get(targetToken);
        console.log(`[${this.gameCode}] Body Guard ${playerToken} is protecting ${targetPlayer.name}`);
        
        return { success: true, message: `Protecting ${targetPlayer.name}` };
    }

    /**
     * Syndicate votes for assassin (who performs the kill)
     */
    assassinVote(playerToken, assassinToken) {
        const role = this.getPlayerRole(playerToken);
        if (role !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can vote for assassin' };
        }
        
        // Assassin must be a syndicate member
        const assassinRole = this.getPlayerRole(assassinToken);
        if (assassinRole !== 'Syndicate') {
            return { success: false, message: 'Assassin must be a Syndicate member' };
        }
        
        this.assassinVotes.set(playerToken, assassinToken);
        
        return { 
            success: true, 
            message: 'Assassin vote recorded',
            assassinUpdate: true,
            assassinRecommendations: this.getAssassinRecommendations()
        };
    }

    /**
     * Get current assassin vote recommendations
     */
    getAssassinRecommendations() {
        const recommendations = [];
        const voteCounts = {};
        const lockedIn = [];
        
        const syndicateMembers = this.getSyndicateMembers();
        
        for (const [voterToken, assassinToken] of this.assassinVotes) {
            const voter = this.players.get(voterToken);
            const assassin = this.players.get(assassinToken);
            
            if (voter && assassin) {
                recommendations.push({
                    voterId: voterToken,
                    voterName: voter.name,
                    targetId: assassinToken,
                    targetName: assassin.name
                });
                
                voteCounts[assassinToken] = (voteCounts[assassinToken] || 0) + 1;
            }
        }
        
        for (const [token, locked] of this.assassinVotesLocked) {
            if (locked) lockedIn.push(token);
        }
        
        return {
            recommendations,
            voteCounts,
            lockedIn,
            totalSyndicates: syndicateMembers.length,
            lockedInCount: lockedIn.length
        };
    }

    /**
     * Lock in assassin vote
     */
    lockAssassinVote(playerToken) {
        if (this.getPlayerRole(playerToken) !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can lock assassin votes' };
        }
        
        this.assassinVotesLocked.set(playerToken, true);
        
        const recommendations = this.getAssassinRecommendations();
        return {
            success: true,
            assassinUpdate: true,
            assassinRecommendations: recommendations,
            allLocked: this.allAssassinVotesLocked()
        };
    }

    /**
     * Check if all syndicate members locked assassin votes
     */
    allAssassinVotesLocked() {
        const syndicate = this.getSyndicateMembers();
        return syndicate.every(s => this.assassinVotesLocked.has(s.token));
    }

    /**
     * Determine the chosen assassin from votes
     */
    determineAssassin() {
        const votes = new Map();
        
        for (const [voter, assassin] of this.assassinVotes) {
            const count = votes.get(assassin) || 0;
            votes.set(assassin, count + 1);
        }
        
        // Find assassin with most votes
        let chosenAssassin = null;
        let maxVotes = 0;
        let tiedAssassins = [];
        
        for (const [assassinToken, voteCount] of votes) {
            if (voteCount > maxVotes) {
                maxVotes = voteCount;
                chosenAssassin = assassinToken;
                tiedAssassins = [assassinToken];
            } else if (voteCount === maxVotes) {
                tiedAssassins.push(assassinToken);
            }
        }
        
        // If tie, pick random from tied
        if (tiedAssassins.length > 1) {
            chosenAssassin = tiedAssassins[Math.floor(Math.random() * tiedAssassins.length)];
        }
        
        // If no votes, pick random syndicate member
        if (!chosenAssassin) {
            const syndicates = this.getSyndicateMembers();
            if (syndicates.length > 0) {
                chosenAssassin = syndicates[Math.floor(Math.random() * syndicates.length)].token;
            }
        }
        
        this.chosenAssassin = chosenAssassin;
        return chosenAssassin;
    }

    /**
     * Generate a secret word/action for the round
     */
    generateSecretWord() {
        const randomIndex = Math.floor(Math.random() * this.secretWords.length);
        this.currentSecretWord = this.secretWords[randomIndex];
        return this.currentSecretWord;
    }

    /**
     * Day phase: player votes who to arrest
     */
    dayVote(playerToken, votedForToken) {
        if (this.eliminatedPlayers.has(playerToken)) {
            return { success: false, message: 'Eliminated players cannot vote' };
        }

        this.dayVotes.set(playerToken, votedForToken);
        
        // Track voting history
        if (!this.votingHistory[votedForToken]) {
            this.votingHistory[votedForToken] = { accusationVotes: [], trialVotes: [], dayVotes: [] };
        }
        this.votingHistory[votedForToken].dayVotes.push(playerToken);
        
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
        console.log(`[${this.gameCode}] Trial vote recorded: ${playerToken} -> ${normalizedVote}. Total votes: ${this.trialVotes.size}`);
        
        // Track voting history - record voter's verdict (guilty/not-guilty) in this round
        if (!this.votingHistory[playerToken]) {
            this.votingHistory[playerToken] = { roundVotes: {} };
        }
        if (!this.votingHistory[playerToken].roundVotes[this.currentRound]) {
            this.votingHistory[playerToken].roundVotes[this.currentRound] = {};
        }
        this.votingHistory[playerToken].roundVotes[this.currentRound].verdict = normalizedVote;
        
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
        
        // Track voting history - record that this player accused someone in this round
        if (!this.votingHistory[playerToken]) {
            this.votingHistory[playerToken] = { roundVotes: {} };
        }
        if (!this.votingHistory[playerToken].roundVotes[this.currentRound]) {
            this.votingHistory[playerToken].roundVotes[this.currentRound] = {};
        }
        this.votingHistory[playerToken].roundVotes[this.currentRound].accused = targetToken;
        
        const targetRole = this.getPlayerRole(targetToken);
        console.log(`[${this.gameCode}] Accusation vote recorded: ${playerToken} -> ${targetToken} (${targetRole}), total votes: ${this.accusationVotes.size}`);
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

        // Generate rumors for players with 2+ accusations
        for (const [targetToken, count] of voteCounts) {
            if (count >= 2) {
                const targetPlayer = this.players.get(targetToken);
                const rumor = `Round ${this.currentRound}: A rumor has come to light that player ${targetPlayer?.name || targetToken} is suspicious.`;
                this.gameNotes.push(rumor);
                console.log(`[${this.gameCode}] Added rumor: ${rumor}`);
            }
        }

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
        // Ensure eliminatedPlayers is initialized
        if (!this.eliminatedPlayers) {
            this.eliminatedPlayers = new Set();
        }
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

        // Only add investigation results in the murder phase (phase 2) after they were locked in during night
        const investigation = this.detectiveInvestigations.get(detectiveToken);
        console.log(`[${this.gameCode}] buildDetectiveData: detective=${detectiveToken}, hasInvestigation=${!!investigation}, displayed=${investigation?.displayed}, currentPhase=${this.currentPhase}`);
        
        // Include results only if:
        // 1. Investigation exists and has results
        // 2. NOT already displayed
        // 3. We are in murder phase (the phase where results should be shown)
        if (investigation && investigation.results && !investigation.displayed && this.currentPhase === 'murder') {
            // Results should only be shown once in the murder phase
            investigation.displayed = true;
            detectiveData.investigationResults = investigation.results;
            console.log(`[${this.gameCode}] buildDetectiveData: INCLUDING investigation results for ${investigation.results.targetName}`);
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
            gameState.wasSaved = this.lastWasSaved;
            
            // Check if player is eyewitness - show them the assassin and secret word
            gameState.isEyewitness = playerRole === 'Eye Witness';
            if (gameState.isEyewitness && this.settings.enableEyeWitness) {
                const assassinPlayer = this.chosenAssassin ? this.players.get(this.chosenAssassin) : null;
                gameState.eyewitnessData = {
                    message: 'You witnessed the assassination! You know who did it.',
                    assassinName: assassinPlayer ? assassinPlayer.name : 'Unknown',
                    assassinToken: this.chosenAssassin,
                    secretWord: this.currentSecretWord,
                    instruction: `During the discussion, use the secret action: "${this.currentSecretWord}" to signal the Detective without revealing yourself.`
                };
                console.log(`[${this.gameCode}] Eye Witness sees assassin: ${assassinPlayer?.name}, secret word: ${this.currentSecretWord}`);
            } else if (gameState.isEyewitness) {
                gameState.eyewitnessData = {
                    message: 'You witnessed what happened last night.',
                    secretWord: null
                };
            }
            
            // Check if player is detective - give them the secret word to look for
            gameState.isDetective = playerRole === 'Detective';
            if (gameState.isDetective && this.settings.enableEyeWitness) {
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
                gameState.detectiveData.secretWordKeyword = this.currentSecretWord;
                gameState.detectiveData.hint = `Watch for someone who: "${this.currentSecretWord}". The Eye Witness will use this action to signal you about the assassin.`;
                console.log(`[${this.gameCode}] Detective looking for secret word: ${this.currentSecretWord}`);
            } else if (gameState.isDetective) {
                // Add case notes even if eyewitness is disabled
                gameState.detectiveData = this.buildDetectiveData(playerToken, alivePlayersWithStatus);
                console.log(`[${this.gameCode}] Sending case notes to detective`);
            }
            
            // Check if player is the chosen assassin - warn them about eye witness
            const isChosenAssassin = playerRole === 'Syndicate' && playerToken === this.chosenAssassin;
            gameState.isAssassin = isChosenAssassin;
            if (isChosenAssassin && this.settings.enableEyeWitness) {
                gameState.assassinData = {
                    warning: 'You performed the assassination. Be careful - someone may have witnessed you!',
                    youAreTheAssassin: true
                };
                console.log(`[${this.gameCode}] Sending assassin warning to ${playerToken}`);
            } else if (playerRole === 'Syndicate') {
                // Other syndicates know the kill happened but aren't the assassin
                gameState.syndicateInfo = {
                    message: 'The assassination was carried out by your team.'
                };
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
                const currentRecommendations = this.getSyndicateRecommendations();
                const myVote = this.nightVotes.get(playerToken);
                const isLockedIn = this.nightVotesLocked.has(playerToken);
                
                gameState.syndicateData = {
                    syndicateIds: this.getSyndicateMembers().map(m => m.token),
                    stage: 'target',
                    recommendations: currentRecommendations,
                    myRecommendation: myVote || null,
                    lockedIn: isLockedIn,
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
            gameState.gameNotes = this.gameNotes;
        }

        // Add game notes to all phases
        if (!gameState.gameNotes) {
            gameState.gameNotes = this.gameNotes;
        }

        // Add suspicion levels for all players when game has ended
        if (this.currentPhase === 'ended') {
            gameState.playerSuspicionLevels = {};
            this.getPlayers().forEach(player => {
                const suspicion = this.calculateSuspicionLevel(player.token);
                gameState.playerSuspicionLevels[player.token] = {
                    level: suspicion.level,
                    score: suspicion.suspicionScore,
                    reasons: suspicion.reasons
                };
            });
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
        
        // Handle case where someone was saved by the body guard
        if (this.lastWasSaved && this.lastProtectedPlayer) {
            const protectedPlayer = this.players.get(this.lastProtectedPlayer);
            const protectedName = protectedPlayer ? protectedPlayer.name : 'someone';
            
            const savedStories = [
                `🛡️ The Syndicate tried to strike last night, but ${protectedName} was mysteriously protected! Someone is watching over the innocent.`,
                `✨ A guardian angel watched over ${protectedName} last night. The Syndicate's assassination attempt failed!`,
                `🛡️ ${protectedName} narrowly escaped death! An unknown protector thwarted the Syndicate's plans.`,
                `🌟 The Syndicate's blade found no victim. ${protectedName} was saved by a mysterious guardian.`,
                `🔰 Against all odds, ${protectedName} survived the night. The Syndicate's plan was foiled by an unseen hero.`
            ];
            return savedStories[Math.floor(Math.random() * savedStories.length)];
        }
        
        // Handle case where syndicate couldn't agree (tie vote)
        if (!this.lastVictim && this.lastMurderTarget === null && !this.lastWasSaved) {
            const tieStories = [
                '🌙 The night passed quietly. The Syndicate could not agree on a target, and no one was harmed.',
                '😮‍💨 Morning arrived with relief - no assassination took place last night. The Syndicate was divided.',
                '🌅 A peaceful night for once. Internal disagreement within the Syndicate spared everyone.',
                '✨ Against all odds, everyone survived the night. The Syndicate failed to coordinate.',
                '🤝 Rumors suggest the Syndicate couldn\'t reach a consensus. All citizens wake safely.'
            ];
            return tieStories[Math.floor(Math.random() * tieStories.length)];
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
     * Calculate suspicion level based on voting patterns across all rounds
     */
    calculateSuspicionLevel(targetToken) {
        const targetPlayer = this.players.get(targetToken);
        if (!targetPlayer) {
            return { level: 'Unknown', suspicionScore: 0 };
        }

        let suspicionScore = 0;
        let reasons = [];

        // Get voting history for this player - new structure uses roundVotes
        const targetHistory = this.votingHistory[targetToken] || { roundVotes: {} };

        // Count their voting patterns
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
        
        // Count votes AGAINST the target from other players
        let votesAgainstCount = 0;
        Object.entries(this.votingHistory).forEach(([voterToken, voterHistory]) => {
            if (voterToken !== targetToken && voterHistory.roundVotes) {
                Object.entries(voterHistory.roundVotes).forEach(([round, voteData]) => {
                    if (voteData.accused === targetToken) {
                        votesAgainstCount++;
                    }
                });
            }
        });

        console.log(`[SUSPICION] ${targetPlayer.name}: votesAgainst=${votesAgainstCount}, guiltyVotes=${timesVotedGuilty}, notGuiltyVotes=${timesVotedNotGuilty}`);

        // ==================== INCOMING SUSPICION (votes/accusations against them) ====================
        
        // Being accused by other players is a major indicator
        // Each accusation adds significant points
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
            suspicionScore: Math.min(suspicionScore, 100),  // Cap at 100
            reasons: reasons.length > 0 ? reasons : ['No suspicious activity detected']
        };
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
            case 'bodyguard-protect':
                return this.handleBodyGuardProtect(playerToken, data);
            case 'assassin-vote':
                return this.handleAssassinVote(playerToken, data);
            case 'assassin-lock':
                return this.handleAssassinLock(playerToken);
            default:
                return { success: false, message: 'Unknown event' };
        }
    }
    
    /**
     * Handle body guard protection choice
     */
    handleBodyGuardProtect(playerToken, data) {
        const role = this.getPlayerRole(playerToken);
        if (role !== 'Body Guard') {
            return { success: false, message: 'Only Body Guard can protect' };
        }
        
        const { targetToken } = data || {};
        if (!targetToken) {
            return { success: false, message: 'No protection target provided' };
        }
        
        // Can't protect the same person twice in a row
        if (targetToken === this.lastProtectedPlayer) {
            return { success: false, message: 'Cannot protect the same person two nights in a row' };
        }
        
        // Can't protect yourself
        if (targetToken === playerToken) {
            return { success: false, message: 'Cannot protect yourself' };
        }
        
        const result = this.setBodyGuardProtection(playerToken, targetToken);
        console.log(`[${this.gameCode}] Body Guard ${playerToken} protecting ${targetToken}`);
        
        return result;
    }
    
    /**
     * Handle assassin vote from syndicate
     */
    handleAssassinVote(playerToken, data) {
        const role = this.getPlayerRole(playerToken);
        if (role !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can vote for assassin' };
        }
        
        const { targetToken } = data || {};
        if (!targetToken) {
            return { success: false, message: 'No assassin vote provided' };
        }
        
        // Target must be a syndicate member
        const targetRole = this.getPlayerRole(targetToken);
        if (targetRole !== 'Syndicate') {
            return { success: false, message: 'Can only vote for syndicate members as assassin' };
        }
        
        const result = this.assassinVote(playerToken, targetToken);
        console.log(`[${this.gameCode}] Syndicate ${playerToken} voted for ${targetToken} as assassin`);
        
        return result;
    }
    
    /**
     * Handle assassin lock from syndicate
     */
    handleAssassinLock(playerToken) {
        const role = this.getPlayerRole(playerToken);
        if (role !== 'Syndicate') {
            return { success: false, message: 'Only Syndicate can lock assassin vote' };
        }
        
        const result = this.lockAssassinVote(playerToken);
        console.log(`[${this.gameCode}] Syndicate ${playerToken} locked assassin vote`);
        
        return result;
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
    }


}

module.exports = SecretSyndicates;