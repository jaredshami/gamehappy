/**
 * Test the test game advancement logic
 */

const SecretSyndicates = require('./games/SecretSyndicates');

// Create a test game with 5 players starting at round 1
const game = new SecretSyndicates('TEST002');

const players = [
    { token: 'p1', name: 'Player 1' },
    { token: 'p2', name: 'Player 2' },
    { token: 'p3', name: 'Player 3' },
    { token: 'p4', name: 'Player 4' },
    { token: 'p5', name: 'Player 5' }
];

console.log('[TEST] Creating game with 5 players...');
for (const player of players) {
    game.addPlayer(player.token, player.name);
}

game.assignRoles();
game.currentRound = 1;
game.currentPhase = 'night';

console.log('\n[TEST] Starting game simulation for 1 full round (5 phases)...');
console.log('[TEST] Initial phase:', game.currentPhase);

// Simulate 5 phases (1 complete round)
const phasesPerRound = 5;

for (let phaseNum = 0; phaseNum < phasesPerRound; phaseNum++) {
    console.log(`\n=== PHASE ${phaseNum + 1}: ${game.currentPhase.toUpperCase()} ===`);
    
    const alivePlayers = game.getAlivePlayers();
    console.log(`Alive players: ${alivePlayers.map(p => game.players.get(p.token).name).join(', ')}`);
    
    // Auto-populate votes based on current phase
    if (game.currentPhase === 'night') {
        const syndicate = game.getSyndicateMembers();
        if (syndicate.length > 0) {
            const targets = alivePlayers.filter(p => !syndicate.some(s => s.token === p.token));
            if (targets.length > 0) {
                const randomTarget = targets[Math.floor(Math.random() * targets.length)];
                for (const member of syndicate) {
                    if (!game.nightVotesLocked.has(member.token)) {
                        game.nightVote(member.token, randomTarget.token);
                        game.lockNightVotes(member.token);
                        console.log(`  ${game.players.get(member.token).name} voted to kill ${game.players.get(randomTarget.token).name}`);
                    }
                }
            }
        }
    }
    
    if (game.currentPhase === 'accusation' && alivePlayers.length > 0) {
        console.log('  Setting up accusation votes...');
        for (const player of alivePlayers) {
            if (!game.accusationVotes.has(player.token)) {
                const targets = alivePlayers.filter(p => p.token !== player.token);
                if (targets.length > 0) {
                    const randomTarget = targets[Math.floor(Math.random() * targets.length)];
                    game.accusationVote(player.token, randomTarget.token);
                    console.log(`  ${game.players.get(player.token).name} accused ${game.players.get(randomTarget.token).name}`);
                }
            }
        }
    }
    
    if (game.currentPhase === 'verdict' && alivePlayers.length > 0 && game.accusedPlayer) {
        console.log(`  Setting up verdict votes (accused: ${game.players.get(game.accusedPlayer).name})...`);
        for (const player of alivePlayers) {
            if (!game.trialVotes.has(player.token)) {
                const vote = Math.random() > 0.5 ? 'guilty' : 'not-guilty';
                game.trialVote(player.token, vote);
                console.log(`  ${game.players.get(player.token).name} voted ${vote.toUpperCase()}`);
            }
        }
    }
    
    // Advance phase
    console.log('\n  Advancing to next phase...');
    const result = game.advancePhase();
    
    if (result.gameEnded) {
        console.log('\n⚠️  GAME ENDED!');
        console.log(`   Winner: ${result.winCondition.winner}`);
        console.log(`   Reason: ${result.winCondition.winType}`);
        break;
    }
    
    console.log(`  Next phase: ${game.currentPhase}`);
    console.log(`  Eliminated: ${Array.from(game.eliminatedPlayers).map(t => game.players.get(t).name).join(', ') || 'none'}`);
}

console.log('\n[TEST] Test complete!');
