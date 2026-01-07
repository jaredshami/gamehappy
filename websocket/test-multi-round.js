#!/usr/bin/env node
/**
 * Test multiple rounds of game play to demonstrate voting patterns and suspicion levels
 */

const SecretSyndicates = require('./games/SecretSyndicates');

// Create a game
const game = new SecretSyndicates('MULTI001');

console.log('[TEST] Creating multi-round game test...');

// Add 5 players
const playerNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
const playerTokens = [];
playerNames.forEach((name, i) => {
    const token = `player${i+1}`;
    game.addPlayer(token, name);
    playerTokens.push(token);
});

// Assign roles
const roles = ['Innocent', 'Innocent', 'Detective', 'Syndicate', 'Innocent'];
roles.forEach((role, i) => {
    game.roles.set(playerTokens[i], role);
});

console.log('[TEST] Game created with players:');
playerTokens.forEach((token, i) => {
    console.log(`  ${playerNames[i]} (${token}): ${game.getPlayerRole(token)}`);
});

// ============ ROUND 1 ============
console.log('\n\n=== ROUND 1 ===\n');

// Move to accusation phase
game.currentPhase = 'accusation';
game.playersDone.clear();

// Round 1: Accusation votes (different suspicion levels)
console.log('[ROUND 1] Accusation votes:');
game.accusationVote('player1', 'player4'); // Alice accuses Eve (Syndicate - correct!)
console.log('  Alice -> Eve');
game.accusationVote('player2', 'player2'); // Bob accuses himself
console.log('  Bob -> Bob');
game.accusationVote('player3', 'player4'); // Charlie accuses Eve
console.log('  Charlie -> Eve');
game.accusationVote('player4', 'player3'); // Eve accuses Charlie
console.log('  Eve -> Charlie (suspicious!)');
game.accusationVote('player5', 'player1'); // Diana accuses Alice (wrong!)
console.log('  Diana -> Alice (suspicious!)');

// Move to verdict phase
const phaseResult1 = game.advancePhase();
console.log(`\n[ROUND 1] Advanced to: ${phaseResult1.phase}`);
console.log(`[ROUND 1] Accused player: ${game.accusedPlayer} (${game.getPlayerRole(game.accusedPlayer)})`);

if (!phaseResult1.gameEnded) {
    // Round 1: Verdict votes
    console.log('\n[ROUND 1] Verdict votes:');
    game.trialVote('player1', 'guilty');
    console.log('  Alice -> GUILTY (correct!)');
    game.trialVote('player2', 'guilty');
    console.log('  Bob -> GUILTY (correct!)');
    game.trialVote('player3', 'guilty');
    console.log('  Charlie -> GUILTY (correct!)');
    game.trialVote('player4', 'not-guilty');
    console.log('  Eve -> NOT GUILTY (suspicious!)');
    game.trialVote('player5', 'not-guilty');
    console.log('  Diana -> NOT GUILTY (suspicious!)');

    const phaseResult2 = game.advancePhase();
    console.log(`\n[ROUND 1] Advanced to: ${phaseResult2.phase}`);
    console.log(`[ROUND 1] Result: ${game.accusedPlayer} ${game.eliminatedPlayers.has(game.accusedPlayer) ? 'ELIMINATED' : 'ACQUITTED'}`);

    // ============ ROUND 2 ============
    if (!phaseResult2.gameEnded) {
        console.log('\n\n=== ROUND 2 ===\n');
        
        game.currentPhase = 'accusation';
        game.playersDone.clear();

        // Get alive players
        const alivePlayers = game.getAlivePlayers();
        console.log('[ROUND 2] Alive players:', alivePlayers.map(p => `${p.name} (${game.getPlayerRole(p.token)})`).join(', '));

        // Round 2: Accusation votes (Eve voting more suspicious now)
        console.log('\n[ROUND 2] Accusation votes:');
        if (alivePlayers.find(p => p.token === 'player1')) {
            game.accusationVote('player1', 'player5'); // Alice accuses Diana
            console.log('  Alice -> Diana');
        }
        if (alivePlayers.find(p => p.token === 'player2')) {
            game.accusationVote('player2', 'player4'); // Bob accuses Eve
            console.log('  Bob -> Eve');
        }
        if (alivePlayers.find(p => p.token === 'player3')) {
            game.accusationVote('player3', 'player4'); // Charlie accuses Eve
            console.log('  Charlie -> Eve');
        }
        if (alivePlayers.find(p => p.token === 'player4')) {
            game.accusationVote('player4', 'player5'); // Eve accuses Diana
            console.log('  Eve -> Diana');
        }
        if (alivePlayers.find(p => p.token === 'player5')) {
            game.accusationVote('player5', 'player4'); // Diana accuses Eve
            console.log('  Diana -> Eve');
        }

        const phaseResult3 = game.advancePhase();
        console.log(`\n[ROUND 2] Advanced to: ${phaseResult3.phase}`);
        console.log(`[ROUND 2] Accused player: ${game.accusedPlayer} (${game.getPlayerRole(game.accusedPlayer)})`);

        if (!phaseResult3.gameEnded && game.accusedPlayer) {
            // Round 2: Verdict votes
            console.log('\n[ROUND 2] Verdict votes:');
            for (const p of alivePlayers) {
                if (p.token === 'player1') {
                    game.trialVote('player1', 'guilty');
                    console.log('  Alice -> GUILTY');
                } else if (p.token === 'player2') {
                    game.trialVote('player2', 'guilty');
                    console.log('  Bob -> GUILTY');
                } else if (p.token === 'player3') {
                    game.trialVote('player3', 'guilty');
                    console.log('  Charlie -> GUILTY');
                } else if (p.token === 'player4') {
                    game.trialVote('player4', 'not-guilty');
                    console.log('  Eve -> NOT GUILTY');
                } else if (p.token === 'player5') {
                    game.trialVote('player5', 'guilty');
                    console.log('  Diana -> GUILTY');
                }
            }

            const phaseResult4 = game.advancePhase();
            console.log(`\n[ROUND 2] Advanced to: ${phaseResult4.phase}`);
            console.log(`[ROUND 2] Result: ${game.accusedPlayer} ${game.eliminatedPlayers.has(game.accusedPlayer) ? 'ELIMINATED' : 'ACQUITTED'}`);
        }
    }
}

// ============ FINAL REPORT ============
console.log('\n\n=== FINAL REPORT ===\n');

// Calculate and display suspicion levels
console.log('[FINAL] Suspicion Levels:');
playerTokens.forEach(token => {
    const player = game.players.get(token);
    if (player) {
        const suspicion = game.calculateSuspicionLevel(token);
        console.log(`  ${player.name}: ${suspicion.level} (${suspicion.suspicionScore}/100)`);
        if (suspicion.reasons.length > 0) {
            suspicion.reasons.forEach(reason => {
                console.log(`    - ${reason}`);
            });
        }
    }
});

// Display voting history
console.log('\n[FINAL] Voting History:');
Object.entries(game.votingHistory).forEach(([token, history]) => {
    const player = game.players.get(token);
    if (player && history.roundVotes) {
        console.log(`  ${player.name}:`);
        Object.entries(history.roundVotes).forEach(([round, votes]) => {
            const accused = game.players.get(votes.accused);
            const accusedName = accused ? accused.name : '?';
            console.log(`    Round ${round}: Accused ${accusedName}, Verdict: ${votes.verdict || 'N/A'}`);
        });
    }
});

console.log('\n[TEST] Multi-round game test complete!');
