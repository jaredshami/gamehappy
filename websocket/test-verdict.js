/**
 * Simple test script to verify verdict elimination logic
 */

const SecretSyndicates = require('./games/SecretSyndicates');

// Create a test game
const game = new SecretSyndicates('TEST001');

// Add 5 test players
const players = [
    { token: 'player1', name: 'Player 1' },
    { token: 'player2', name: 'Player 2' },
    { token: 'player3', name: 'Player 3' },
    { token: 'player4', name: 'Player 4' },
    { token: 'player5', name: 'Player 5' }
];

console.log('[TEST] Adding players...');
for (const player of players) {
    game.addPlayer(player.token, player.name);
}

console.log('[TEST] Assigning roles...');
game.assignRoles();

console.log('[TEST] Game roles assigned:');
for (const player of players) {
    const role = game.getPlayerRole(player.token);
    console.log(`  ${player.name}: ${role}`);
}

// Manually advance to verdict phase
console.log('\n[TEST] Manually setting up verdict phase...');
game.currentPhase = 'accusation';
game.currentRound = 1;

// Find a syndicate member to accuse
const syndicates = game.getSyndicateMembers();
const innocents = game.getAlivePlayers().filter(p => !syndicates.some(s => s.token === p.token));

console.log(`[TEST] Syndicates: ${syndicates.map(s => s.name).join(', ')}`);
console.log(`[TEST] Innocents: ${innocents.map(i => i.name).join(', ')}`);

if (syndicates.length === 0 || innocents.length === 0) {
    console.error('[TEST] ERROR: Need at least 1 syndicate and 1 innocent for test');
    process.exit(1);
}

// Target a syndicate member for accusation
const targetSyndicate = syndicates[0];
console.log(`\n[TEST] Accusing syndicate member: ${targetSyndicate.name}`);

// Have all players vote to accuse the syndicate
for (const player of game.getAlivePlayers()) {
    game.accusationVote(player.token, targetSyndicate.token);
    console.log(`  ${game.players.get(player.token).name} accused ${targetSyndicate.name}`);
}

// Advance to verdict phase
console.log('\n[TEST] Advancing to verdict phase...');
game.advancePhase();

console.log(`[TEST] Current phase: ${game.currentPhase}`);
console.log(`[TEST] Accused player: ${game.accusedPlayer} (${game.players.get(game.accusedPlayer)?.name})`);
console.log(`[TEST] Players eliminated before verdict: ${Array.from(game.eliminatedPlayers).map(t => game.players.get(t)?.name).join(', ') || 'none'}`);

// Now vote GUILTY to eliminate the accused
console.log('\n[TEST] All players voting GUILTY...');
for (const player of game.getAlivePlayers()) {
    game.trialVote(player.token, 'guilty');
    console.log(`  ${game.players.get(player.token).name} voted GUILTY`);
}

console.log(`\n[TEST] Trial votes collected: ${game.trialVotes.size}`);
console.log(`[TEST] Guilty count: ${Array.from(game.trialVotes.values()).filter(v => v === 'guilty').length}`);

// Advance to next phase (should execute verdict)
console.log('\n[TEST] Advancing phase (executing verdict)...');
const result = game.advancePhase();

console.log(`\n[TEST] Result of advancePhase: ${JSON.stringify(result, null, 2)}`);
console.log(`[TEST] Players eliminated after verdict: ${Array.from(game.eliminatedPlayers).map(t => game.players.get(t)?.name).join(', ') || 'none'}`);
console.log(`[TEST] Verdict eliminated player: ${game.verdictEliminatedPlayer} (${game.players.get(game.verdictEliminatedPlayer)?.name})`);

// Check if syndicate was actually eliminated
if (game.eliminatedPlayers.has(targetSyndicate.token)) {
    console.log(`\n✅ SUCCESS: Syndicate member ${targetSyndicate.name} was eliminated by guilty verdict!`);
} else {
    console.log(`\n❌ FAILURE: Syndicate member ${targetSyndicate.name} was NOT eliminated despite guilty verdict!`);
    process.exit(1);
}
