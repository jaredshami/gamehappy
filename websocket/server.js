const fs = require('fs');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');
const GameServer = require('./games/GameServer');

const app = express();
const server = https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}, app);

const io = new Server(server, {
  path: '/websocket',
  cors: {
    origin: ['https://gamehappy.app', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Game history file path - use absolute path for reliability
const GAME_HISTORY_FILE = require('path').join(__dirname, 'game-history.json');

// Ensure game history file exists
function ensureGameHistoryFile() {
  try {
    if (!fs.existsSync(GAME_HISTORY_FILE)) {
      console.log(`[HISTORY] Creating game history file at: ${GAME_HISTORY_FILE}`);
      fs.writeFileSync(GAME_HISTORY_FILE, JSON.stringify([], null, 2));
    }
  } catch (err) {
    console.error(`[HISTORY] Error ensuring file exists:`, err);
  }
}

// Load game history from file
function loadGameHistory() {
  try {
    ensureGameHistoryFile();
    if (!fs.existsSync(GAME_HISTORY_FILE)) {
      console.warn(`[HISTORY] File does not exist: ${GAME_HISTORY_FILE}`);
      return [];
    }
    const data = fs.readFileSync(GAME_HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(data) || [];
    console.log(`[HISTORY] Loaded ${parsed.length} games from history`);
    return parsed;
  } catch (err) {
    console.error(`[HISTORY] Error loading game history from ${GAME_HISTORY_FILE}:`, err);
    return [];
  }
}

// Save game history to file
function saveGameHistory(games) {
  try {
    console.log(`[HISTORY] Saving ${games.length} games to ${GAME_HISTORY_FILE}`);
    fs.writeFileSync(GAME_HISTORY_FILE, JSON.stringify(games, null, 2));
    console.log(`[HISTORY] Successfully saved games to history`);
  } catch (err) {
    console.error(`[HISTORY] Error saving game history to ${GAME_HISTORY_FILE}:`, err);
  }
}

// Create a game replay object for storage
function createGameReplay(game, finalGameState) {
  return {
    gameCode: game.gameCode,
    players: game.getPlayers().map(p => ({
      token: p.token,
      name: p.name,
      role: p.role,
      team: p.role === 'Syndicate' ? 'Syndicate' : 'Town'
    })),
    // Store final game state for reference
    finalState: finalGameState,
    // Initialize empty phases array - will be populated during gameplay
    phases: []
  };
}

// Add CORS headers for HTTP requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://gamehappy.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API: Get game history for a specific month/year
app.get('/api/game-history', (req, res) => {
  try {
    const month = req.query.month || new Date().getMonth().toString().padStart(2, '0');
    const year = req.query.year || new Date().getFullYear();
    
    const games = loadGameHistory();
    
    // Filter games by month and year
    const filteredGames = games.filter(game => {
      const gameDate = new Date(game.completedAt);
      const gameMonth = (gameDate.getMonth() + 1).toString().padStart(2, '0');
      const gameYear = gameDate.getFullYear().toString();
      return gameMonth === month && gameYear === year.toString();
    });

    // Sort by date descending
    filteredGames.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    // Calculate totals
    const monthTotal = filteredGames.length;
    const yearTotal = games.filter(game => new Date(game.completedAt).getFullYear().toString() === year.toString()).length;

    res.json({
      success: true,
      games: filteredGames,
      monthTotal,
      yearTotal
    });
  } catch (err) {
    console.error('Error fetching game history:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API: Delete a game from history
app.delete('/api/game-history/:gameId', (req, res) => {
  try {
    const gameId = req.params.gameId;
    let games = loadGameHistory();
    
    games = games.filter(game => game.id !== gameId);
    saveGameHistory(games);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting game from history:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Initialize game server
const gameServer = new GameServer();

// Initialize game history file
ensureGameHistoryFile();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Generate unique player token (could use existing token from client)
  const playerToken = socket.handshake.query.token || socket.id;

  // Helper function to extract action details
  const extractActionDetails = (eventName, payload, player) => {
    const details = {};
    
    switch(eventName) {
      case 'select-target':
      case 'select-assassin':
      case 'protect-player':
      case 'investigate-player':
        details.targetName = payload?.targetName || payload?.playerName || 'Unknown';
        if (payload?.suspicionLevel) details.suspicionLevel = payload.suspicionLevel;
        break;
      case 'cast-vote':
        details.targetName = payload?.targetName || 'Anonymous';
        details.anonymous = payload?.anonymous !== false;
        break;
      case 'trial-vote':
        details.verdict = payload?.verdict || 'unknown';
        break;
      case 'phase-transition':
        details.newPhase = payload?.phase;
        details.eliminatedPlayer = payload?.eliminatedPlayer;
        details.winner = payload?.winner;
        break;
      case 'join-game':
        details.playerName = player?.name;
        break;
      case 'ready':
        details.ready = payload?.ready !== false;
        break;
      default:
        if (payload) details.payload = payload;
    }
    
    return details;
  };

  // ==== GAME MANAGEMENT EVENTS ====

  /**
   * Create a new game
   */
  socket.on('create-game', (data, callback) => {
    try {
      const { gameType, playerName, settings } = data;
      console.log(`Creating game: ${gameType} for player: ${playerName}, socket token: ${playerToken}, socket.id: ${socket.id}`);

      const result = gameServer.createGame(gameType, playerToken, playerName);
      
      if (result.success) {
        const gameCode = result.gameCode;
        
        // Join socket to game room
        socket.join(`game-${gameCode}`);
        
        // Apply settings if provided
        if (settings) {
          gameServer.setGameSettings(gameCode, settings);
        }

        // Notify all in lobby
        io.to(`game-${gameCode}`).emit('game-created', {
          gameCode,
          game: result.game,
          isHost: result.isHost,
          playerToken: playerToken
        });

        callback({ success: true, gameCode, game: result.game, isHost: result.isHost, playerToken: playerToken });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error creating game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Join an existing game
   */
  socket.on('join-game', (data, callback) => {
    try {
      const { gameCode, playerName } = data;
      console.log(`Player ${playerName} joining game: ${gameCode}, socket token: ${playerToken}, socket.id: ${socket.id}`);

      const result = gameServer.joinGame(gameCode, playerToken, playerName);
      
      if (result.success) {
        // Join socket to game room
        socket.join(`game-${gameCode}`);

        // Notify everyone in the game
        io.to(`game-${gameCode}`).emit('player-joined', {
          game: result.game,
          playerName,
          playerToken: playerToken
        });

        callback({ success: true, gameCode, game: result.game, isHost: result.isHost, playerToken: playerToken });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error joining game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Get current game state
   */
  socket.on('get-game-state', (callback) => {
    try {
      const gameState = gameServer.getGameStateForPlayer(playerToken);
      
      if (gameState) {
        callback({ success: true, gameState });
      } else {
        callback({ success: false, message: 'Player not in a game' });
      }
    } catch (err) {
      console.error('Error getting game state:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Start a game (host only)
   */
  socket.on('start-game', (data, callback) => {
    try {
      const { gameCode } = data;
      console.log(`Starting game: ${gameCode}`);

      const result = gameServer.startGame(gameCode, playerToken);
      
      if (result.success) {
        const game = gameServer.games.get(gameCode);
        
        // Send game-started to each player with their individual gameState
        for (const [socketId, playerSocket] of io.sockets.sockets) {
          // Find which player this socket belongs to
          const playerToken = playerSocket.handshake.query.token || socketId;
          
          if (game.hasPlayer(playerToken)) {
            const playerGameState = gameServer.getGameStateForPlayer(playerToken);
            playerSocket.emit('game-started', {
              phase: result.phase,
              round: result.round,
              gameState: playerGameState
            });
            console.log(`[${gameCode}] Sent game-started to player ${playerToken} with role: ${playerGameState.playerRole}`);
          }
        }

        callback({ success: true, phase: result.phase });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error starting game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Add bot players to game
   */
  socket.on('add-bots', (data, callback) => {
    try {
      const { gameCode, botCount } = data;
      console.log(`[${gameCode}] Host requesting to add ${botCount} bot(s)`);

      const game = gameServer.games.get(gameCode);
      if (!game) {
        return callback({ success: false, message: 'Game not found' });
      }

      // Verify host is requesting this
      if (game.host !== playerToken) {
        return callback({ success: false, message: 'Only host can add bots' });
      }

      // Check total won't exceed 5 players (or configure max as needed)
      const totalWillBe = game.getPlayerCount() + botCount;
      if (totalWillBe > 5) {
        return callback({ success: false, message: `Cannot exceed 5 players (would have ${totalWillBe})` });
      }

      // Add bots to the game
      const result = game.addBotPlayers(botCount);

      if (result.success) {
        // CRITICAL: Assign roles to newly added bots
        // We need to re-run role assignment to include the new bots
        const roleResult = game.assignRoles();
        if (!roleResult.success) {
          console.warn(`[${gameCode}] Warning: Could not assign roles to bots: ${roleResult.message}`);
        }
        
        // Auto-ready all bots immediately
        for (const bot of result.botsAdded) {
          game.setPlayerReady(bot.token);
        }

        // Get updated game state after bots are ready
        const gameState = gameServer.getGameStateForPlayer(playerToken);

        // Broadcast updated player list to all players in game
        io.to(`game-${gameCode}`).emit('player-joined', {
          game: game.getLobbyInfo(),
          botsAdded: result.botsAdded
        });

        // Broadcast ready status update
        io.to(`game-${gameCode}`).emit('player-ready-updated', {
          playerCount: gameState.readyCount,
          totalPlayers: gameState.totalPlayers,
          gameState
        });

        // Check if all players are ready now (including bots) - if so, emit phase-start event
        if (game.allPlayersReady && typeof game.allPlayersReady === 'function' && game.allPlayersReady()) {
          console.log(`[${gameCode}] ALL PLAYERS READY (including bots)! Broadcasting on-phase-start to each player`);
          // All players ready - emit phase-start to trigger game flow
          // Send to each player with their individual gameState
          for (const [socketId, playerSocket] of io.sockets.sockets) {
            const playerToken = playerSocket.handshake.query.token || socketId;
            
            if (game.hasPlayer(playerToken)) {
              const playerGameState = gameServer.getGameStateForPlayer(playerToken);
              playerSocket.emit('on-phase-start', {
                phase: 1,
                phaseState: playerGameState,
                phaseName: 'Night Phase'
              });
              console.log(`[${gameCode}] Sent on-phase-start to player ${playerToken} with role: ${playerGameState.playerRole}`);
            }
          }
          
          // Auto-perform bot actions for night phase (phase 1)
          const botPlayersNight = game.getBotPlayers ? game.getBotPlayers() : [];
          for (const botPlayer of botPlayersNight) {
            const botRole = game.getPlayerRole ? game.getPlayerRole(botPlayer.token) : null;
            const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
            
            console.log(`[${gameCode}] Processing bot ${botPlayer.name} [${botRole}]`);
            
            let action = null;
            
            // Get bot action based on role and phase
            if (game.getBotAction) {
              action = game.getBotAction(botPlayer.token, 'night'); // night phase for getBotAction
            } else if (game.getBotSyndicateNightAction && botRole === 'Syndicate') {
              action = game.getBotSyndicateNightAction(botPlayer.token, alivePlayers);
            } else if (game.getBotBodyGuardAction && botRole === 'BodyGuard') {
              action = game.getBotBodyGuardAction(botPlayer.token, alivePlayers);
            }
            
            // Execute action if bot has one
            if (action) {
              console.log(`[${gameCode}] Bot ${botPlayer.name} executing action:`, action);
              if (action.type === 'nightVote') {
                gameServer.handleGameEvent(botPlayer.token, 'night-vote', { target: action.target });
                // Broadcast bot action to all players
                io.to(`game-${gameCode}`).emit('game-event', {
                  eventName: 'bot-action-performed',
                  payload: {
                    playerName: botPlayer.name,
                    action: 'voted for assassination target'
                  }
                });
              } else if (action.type === 'bodyguardProtect') {
                gameServer.handleGameEvent(botPlayer.token, 'bodyguard-protect', { targetToken: action.target });
                // Broadcast bot action to all players
                io.to(`game-${gameCode}`).emit('game-event', {
                  eventName: 'bot-action-performed',
                  payload: {
                    playerName: botPlayer.name,
                    action: 'chose protection target'
                  }
                });
              }
            } else {
              console.log(`[${gameCode}] Bot ${botPlayer.name} [${botRole}] has no action for night phase (OK - passive role)`);
            }
            
            // Always mark bot as done - whether they had an action or not
            if (game.setPlayerDone) {
              game.setPlayerDone(botPlayer.token);
              console.log(`[${gameCode}] Bot ${botPlayer.name} marked done for phase`);
              
              // Broadcast to all players that this bot is done (for UI counter updates)
              io.to(`game-${gameCode}`).emit('player-done-notification', {
                playerToken: botPlayer.token,
                playerName: botPlayer.name,
                isDone: true
              });
            }
          }
          
          // Check if all players are done
          const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
          console.log(`[${gameCode}] All players done check: ${allDone}`);
          
          if (allDone) {
            console.log(`[${gameCode}] AUTO-ADVANCING PHASE!`);
            const phaseResult = game.advancePhase();
            if (phaseResult.success) {
              io.to(`game-${gameCode}`).emit('game-event', {
                eventName: 'phase-advancing',
                payload: { fromPhase: game.currentPhase, toPhase: phaseResult.phase }
              });
            }
          }
        }

        console.log(`[${gameCode}] Successfully added ${result.count} bot(s)`);
        callback({ 
          success: true, 
          message: `Added ${result.count} bot(s)`,
          botsAdded: result.botsAdded,
          totalPlayers: game.getPlayerCount()
        });
      } else {
        callback({ success: false, message: 'Failed to add bots' });
      }
    } catch (err) {
      console.error('Error adding bots:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Leave current game
   */
  socket.on('leave-game', (callback) => {
    try {
      const game = gameServer.getPlayerGame(playerToken);
      
      if (game) {
        const gameCode = game.gameCode;
        gameServer.removePlayerFromGame(playerToken);
        socket.leave(`game-${gameCode}`);

        // Notify remaining players
        io.to(`game-${gameCode}`).emit('player-left', {
          playerToken,
          game: gameServer.getGameLobbyInfo(gameCode)
        });

        callback({ success: true });
      } else {
        callback({ success: false, message: 'Not in a game' });
      }
    } catch (err) {
      console.error('Error leaving game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  // ==== GAME EVENT HANDLERS ====

  /**
   * Handle game-specific events
   */
  socket.on('game-event', (data, callback) => {
    try {
      const { eventName, payload } = data;
      const game = gameServer.getPlayerGame(playerToken);

      if (!game) {
        if (typeof callback === 'function') callback({ success: false, message: 'Player not in a game' });
        return;
      }

      console.log(`[${game.gameCode}] game-event received: eventName=${eventName}, payload=${JSON.stringify(payload)}`);
      const result = gameServer.handleGameEvent(playerToken, eventName, payload);
      const gameState = gameServer.getGameStateForPlayer(playerToken);

      if (result.success) {
        // Broadcast game state to all players in game
        io.to(`game-${game.gameCode}`).emit('game-state-updated', {
          gameState,
          eventResult: result
        });

        // Broadcast to admin watchers
        const player = game.getPlayers().find(p => p.token === playerToken);
        if (player) {
          const fullGameState = gameServer.getGameStateForPlayer(playerToken);
          const playerIsReady = game.playersReady && game.playersReady.has(playerToken);
          
          // Determine current screen based on game state
          // If player hasn't clicked "I'm Ready" yet, they're on role-screen
          // Otherwise, they're on whatever phase the game is in
          let screenType = 'role-screen';
          if (playerIsReady && game.currentPhase && game.currentPhase !== 'not-started' && game.currentPhase !== 'waiting') {
            screenType = game.currentPhase;
          } else if (player.role && !playerIsReady) {
            screenType = 'role-screen';
          } else {
            screenType = 'lobby-screen';
          }
          
          const adminUpdate = {
            gameCode: game.gameCode,
            playerToken: playerToken,
            playerName: player.name,
            role: player.role,
            alive: player.alive,
            phase: game.currentPhase,
            screen: screenType,
            playerIsReady: playerIsReady,
            action: eventName,
            actionDetails: extractActionDetails(eventName, payload, player),
            state: result.success ? 'Success' : 'Failed',
            gameState: fullGameState
          };
          console.log(`[ADMIN] Broadcasting to admin-watch-${game.gameCode}:`, adminUpdate);
          io.to(`admin-watch-${game.gameCode}`).emit('player-state-update', adminUpdate);
        }        // Handle syndicate real-time updates (night-vote or night-lock)
        if (result.syndicateUpdate && (eventName === 'night-vote' || eventName === 'night-lock')) {
          console.log(`[${game.gameCode}] Broadcasting syndicate update to syndicate members`);
          
          // Get all syndicate members
          const syndicateMembers = game.getSyndicateMembers ? game.getSyndicateMembers() : [];
          
          // Broadcast to all syndicate members
          for (const [socketId, playerSocket] of io.sockets.sockets) {
            const pToken = playerSocket.handshake.query.token || socketId;
            if (syndicateMembers.some(m => m.token === pToken)) {
              playerSocket.emit('syndicate-recommendations-update', {
                action: 'syndicateRecommendationsUpdate',
                recommendations: result.recommendations,
                stage: 'target'
              });
              console.log(`[${game.gameCode}] Sent syndicate update to ${pToken}`);
            }
          }
          
          // If all syndicates have locked in, broadcast lock status and move to assassin voting
          if (result.allLocked) {
            console.log(`[${game.gameCode}] All syndicates locked in on target - moving to assassin voting`);
            for (const [socketId, playerSocket] of io.sockets.sockets) {
              const pToken = playerSocket.handshake.query.token || socketId;
              if (syndicateMembers.some(m => m.token === pToken)) {
                // Get assassin recommendations for initial display
                const assassinRecs = game.getAssassinRecommendations ? game.getAssassinRecommendations() : null;
                playerSocket.emit('syndicate-lock-update', {
                  action: 'syndicateLockInUpdate',
                  lockedInCount: result.recommendations.lockedInCount,
                  totalSyndicates: result.recommendations.totalSyndicates,
                  allLocked: true,
                  stage: 'assassin',
                  target: result.recommendations.consensus,
                  assassinRecommendations: assassinRecs
                });
              }
            }
          }
        }
        
        // Handle assassin voting updates (assassin-vote or assassin-lock)
        if (result.success && (eventName === 'assassin-vote' || eventName === 'assassin-lock')) {
          console.log(`[${game.gameCode}] Broadcasting assassin vote update to syndicate members`);
          
          // Get all syndicate members
          const syndicateMembers = game.getSyndicateMembers ? game.getSyndicateMembers() : [];
          const assassinRecs = game.getAssassinRecommendations ? game.getAssassinRecommendations() : null;
          
          // Broadcast to all syndicate members
          for (const [socketId, playerSocket] of io.sockets.sockets) {
            const pToken = playerSocket.handshake.query.token || socketId;
            if (syndicateMembers.some(m => m.token === pToken)) {
              playerSocket.emit('assassin-recommendations-update', {
                action: 'assassinRecommendationsUpdate',
                recommendations: assassinRecs,
                allLocked: result.allLocked || false
              });
              console.log(`[${game.gameCode}] Sent assassin vote update to ${pToken}`);
            }
          }
        }
        
        // Handle body guard protection updates
        if (result.success && eventName === 'bodyguard-protect') {
          console.log(`[${game.gameCode}] Body Guard protection set`);
          // No need to broadcast - protection is secret
        }

        // Check if all players are done and advance phase if so
        console.log(`[${game.gameCode}] Checking phase advancement: eventName=${eventName}, has allPlayersDone=${typeof game.allPlayersDone}`);
        if (eventName === 'player-done') {
          const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
          console.log(`[${game.gameCode}] player-done check: allPlayersDone=${allDone}, currentPhase=${game.currentPhase}`);
          if (allDone) {
            console.log(`[${game.gameCode}] ALL PLAYERS DONE! Advancing to next phase from ${game.currentPhase}`);
            
            // Advance the phase
            const phaseResult = game.advancePhase();
            if (phaseResult.success) {
              console.log(`[${game.gameCode}] Phase advanced to: ${phaseResult.phase}`);
              
              // Check if game ended (phaseResult will have gameEnded flag if it did)
              if (phaseResult.gameEnded && phaseResult.winCondition) {
                // Game has ended
                console.log(`[${game.gameCode}] GAME ENDED: ${phaseResult.winCondition.winner} wins (${phaseResult.winCondition.winType})`);
                
                // Save completed game to history
                try {
                  const gameHistories = loadGameHistory();
                  gameHistories.push({
                    id: `${game.gameCode}-${Date.now()}`,
                    gameCode: game.gameCode,
                    completedAt: new Date().toISOString(),
                    playerCount: game.getPlayers().length,
                    winner: phaseResult.winCondition.winner,
                    winType: phaseResult.winCondition.winType,
                    duration: phaseResult.winCondition.duration
                  });
                  saveGameHistory(gameHistories);
                  console.log(`[HISTORY] Game ${game.gameCode} saved to history`);
                } catch (historyErr) {
                  console.error(`[HISTORY] Error saving game to history:`, historyErr);
                }
                
                // Calculate suspicion levels for all players
                const playerSuspicionLevels = {};
                game.getPlayers().forEach(player => {
                    const suspicion = game.calculateSuspicionLevel(player.token);
                    playerSuspicionLevels[player.token] = {
                        level: suspicion.level,
                        score: suspicion.suspicionScore,
                        reasons: suspicion.reasons
                    };
                });
                
                // Broadcast game-ended event to all players
                for (const [socketId, playerSocket] of io.sockets.sockets) {
                  const pToken = playerSocket.handshake.query.token || socketId;
                  if (game.hasPlayer(pToken)) {
                    const pGameState = gameServer.getGameStateForPlayer(pToken);
                    // Enhance players with role information
                    const enhancedPlayers = pGameState.players.map(p => ({
                      ...p,
                      role: game.getPlayerRole(p.token)
                    }));
                    playerSocket.emit('game-ended', {
                      winner: phaseResult.winCondition.winner,
                      winType: phaseResult.winCondition.winType,
                      details: phaseResult.winCondition.details,
                      finalRound: pGameState.currentRound,
                      playerRole: pGameState.playerRole,
                      allPlayers: enhancedPlayers,
                      votingHistory: game.votingHistory || {},
                      playerSuspicionLevels: playerSuspicionLevels
                    });
                    console.log(`[${game.gameCode}] Sent game-ended event to ${pToken}`);
                  }
                }
                return;
              }
              
              // Send on-phase-start event to each player with their individual gameState
              for (const [socketId, playerSocket] of io.sockets.sockets) {
                const pToken = playerSocket.handshake.query.token || socketId;
                
                if (game.hasPlayer(pToken)) {
                  const pGameState = gameServer.getGameStateForPlayer(pToken);
                  const phaseName = phaseResult.phase === 'night' ? 'Night Phase' : 
                                   phaseResult.phase === 'murder' ? 'Murder Discovery' :
                                   phaseResult.phase === 'trial' ? 'Trial Phase' : 
                                   phaseResult.phase === 'accusation' ? 'Accusation Vote' :
                                   phaseResult.phase === 'verdict' ? 'Verdict Phase' : phaseResult.phase;
                  
                  // Check if this player is eliminated
                  if (pGameState.eliminated && pGameState.eliminated.includes(pToken)) {
                    // Send elimination event to eliminated players
                    let reason = 'You were eliminated.';
                    let verdict = 'ELIMINATED';
                    // Use previousPhase to determine elimination reason
                    if (phaseResult.previousPhase === 'night') {
                      // Eliminated during night phase = assassinated
                      reason = 'You were assassinated by the Syndicate.';
                      verdict = 'ASSASSINATED';
                    } else if (phaseResult.previousPhase === 'accusation') {
                      // Eliminated during accusation phase = voted out
                      reason = 'You were voted guilty and arrested.';
                      verdict = 'GUILTY';
                    }
                    playerSocket.emit('player-eliminated', {
                      playerName: pGameState.players.find(p => p.token === pToken)?.name || 'Unknown',
                      role: pGameState.playerRole,
                      reason: reason,
                      verdict: verdict,
                      round: pGameState.currentRound
                    });
                    console.log(`[${game.gameCode}] Sent elimination event to ${pToken}`);
                  } else {
                    // Send phase start to alive players
                    const phaseData = {
                      phase: phaseResult.phase === 'night' ? 1 : phaseResult.phase === 'murder' ? 2 : phaseResult.phase === 'trial' ? 3 : phaseResult.phase === 'accusation' ? 4 : phaseResult.phase === 'verdict' ? 5 : 1,
                      phaseState: pGameState,
                      phaseName: phaseName
                    };
                    
                    // Add verdict-specific data
                    if (phaseResult.phase === 'verdict' && pGameState.accusedName) {
                      phaseData.accusedName = pGameState.accusedName;
                      phaseData.guiltyCount = pGameState.guiltyVotes || 0;
                      phaseData.notGuiltyCount = pGameState.notGuiltyVotes || 0;
                    }
                    
                    playerSocket.emit('on-phase-start', phaseData);
                    console.log(`[${game.gameCode}] Sent on-phase-start (${phaseResult.phase}) to player ${pToken}`);
                  }
                }
              }
              
              // Auto-perform bot actions for the new phase
              const botPlayers = game.getBotPlayers ? game.getBotPlayers() : [];
              for (const botPlayer of botPlayers) {
                // Schedule bot action after a small delay to simulate thinking
                setTimeout(() => {
                  console.log(`[${game.gameCode}] Auto-performing action for bot ${botPlayer.name} (${botPlayer.token}) in phase ${phaseResult.phase}`);
                  const botRole = game.getPlayerRole ? game.getPlayerRole(botPlayer.token) : null;
                  const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
                  
                  let action = null;
                  
                  if (phaseResult.phase === 'night') {
                    // Use getBotAction if available (preferred approach)
                    if (game.getBotAction) {
                      action = game.getBotAction(botPlayer.token, 'night');
                    } else {
                      if (botRole === 'Syndicate' && game.getBotSyndicateNightAction) {
                        action = game.getBotSyndicateNightAction(botPlayer.token, alivePlayers);
                      } else if (botRole === 'Bodyguard' && game.getBotBodyGuardAction) {
                        action = game.getBotBodyGuardAction(botPlayer.token, alivePlayers);
                      }
                    }
                  } else if (phaseResult.phase === 'accusation' && game.getBotAccusationVote) {
                    action = game.getBotAccusationVote(botPlayer.token, alivePlayers);
                  } else if (phaseResult.phase === 'verdict' && game.getBotTrialVote) {
                    action = game.getBotTrialVote(botPlayer.token, alivePlayers);
                  }
                  
                  // Emit the bot action
                  if (action) {
                    if (action.type === 'nightVote') {
                      io.to(`game-${gameCode}`).emit('game-event', {
                        playerToken: botPlayer.token,
                        eventName: 'night-vote',
                        payload: { target: action.target }
                      });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for night target ${action.target}`);
                    } else if (action.type === 'bodyguardProtect') {
                      io.to(`game-${gameCode}`).emit('game-event', {
                        playerToken: botPlayer.token,
                        eventName: 'bodyguard-protect',
                        payload: { targetToken: action.target }
                      });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} protecting ${action.target}`);
                    } else if (action.type === 'accusationVote') {
                      io.to(`game-${gameCode}`).emit('game-event', {
                        playerToken: botPlayer.token,
                        eventName: 'accusation-vote',
                        payload: { target: action.target }
                      });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for accusation target ${action.target}`);
                    } else if (action.type === 'trialVote') {
                      io.to(`game-${gameCode}`).emit('game-event', {
                        playerToken: botPlayer.token,
                        eventName: 'trial-vote',
                        payload: { vote: action.vote }
                      });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted ${action.vote} on trial`);
                    }
                  }
                  
                  // Always mark bot as done with this phase (regardless of whether action was taken)
                  if (game.setPlayerDone) {
                    game.setPlayerDone(botPlayer.token);
                    console.log(`[${gameCode}] Bot ${botPlayer.name} marked as done for phase`);
                    
                    // Check if all players are now done
                    const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
                    if (allDone) {
                      console.log(`[${gameCode}] ALL PLAYERS DONE (including bots)! Auto-advancing phase`);
                      const phaseResult2 = game.advancePhase();
                      if (phaseResult2.success) {
                        // Trigger the same phase advancement logic as player-done event
                        io.to(`game-${gameCode}`).emit('game-event', {
                          eventName: 'phase-advancing',
                          payload: { fromPhase: game.currentPhase, toPhase: phaseResult2.phase }
                        });
                      }
                    }
                  }
                }, 100 + Math.random() * 100); // 100-200ms delay
              }
              
              // Clear playersDone for the new phase
              game.playersDone.clear();
              console.log(`[${game.gameCode}] Cleared playersDone tracker for new phase (from player-done)`);
            }
          }
        } else if (eventName === 'accusation-vote') {
          // Broadcast vote count to all players
          const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
          const accusationVotes = game.accusationVotes ? game.accusationVotes.size : 0;
          io.sockets.emit('phase4-vote-update', {
            voteCount: accusationVotes,
            totalPlayers: alivePlayers.length
          });
          console.log(`[${game.gameCode}] accusation-vote: ${accusationVotes}/${alivePlayers.length} players voted`);
          
          // Check if all alive players have voted
          const allVoted = alivePlayers.length > 0 && accusationVotes === alivePlayers.length;
          console.log(`[${game.gameCode}] accusation-vote check: votes=${accusationVotes}, alivePlayers=${alivePlayers.length}, allVoted=${allVoted}`);
          
          if (allVoted) {
            console.log(`[${game.gameCode}] ALL PLAYERS VOTED! Advancing to next phase from ${game.currentPhase}`);
            
            // Advance the phase
            const phaseResult = game.advancePhase();
            if (phaseResult.success) {
              console.log(`[${game.gameCode}] Phase advanced to: ${phaseResult.phase}`);
              
              // Check if game ended
              if (phaseResult.gameEnded && phaseResult.winCondition) {
                // Game has ended
                console.log(`[${game.gameCode}] GAME ENDED: ${phaseResult.winCondition.winner} wins (${phaseResult.winCondition.winType})`);
                
                // Save completed game to history
                try {
                  const gameHistories = loadGameHistory();
                  gameHistories.push({
                    id: `${game.gameCode}-${Date.now()}`,
                    gameCode: game.gameCode,
                    completedAt: new Date().toISOString(),
                    playerCount: game.getPlayers().length,
                    winner: phaseResult.winCondition.winner,
                    winType: phaseResult.winCondition.winType,
                    duration: phaseResult.winCondition.duration
                  });
                  saveGameHistory(gameHistories);
                  console.log(`[HISTORY] Game ${game.gameCode} saved to history`);
                } catch (historyErr) {
                  console.error(`[HISTORY] Error saving game to history:`, historyErr);
                }
                
                // Calculate suspicion levels for all players
                const playerSuspicionLevels = {};
                game.getPlayers().forEach(player => {
                    const suspicion = game.calculateSuspicionLevel(player.token);
                    playerSuspicionLevels[player.token] = {
                        level: suspicion.level,
                        score: suspicion.suspicionScore,
                        reasons: suspicion.reasons
                    };
                });
                
                // Broadcast game-ended event to all players
                for (const [socketId, playerSocket] of io.sockets.sockets) {
                  const pToken = playerSocket.handshake.query.token || socketId;
                  if (game.hasPlayer(pToken)) {
                    const pGameState = gameServer.getGameStateForPlayer(pToken);
                    // Enhance players with role information
                    const enhancedPlayers = pGameState.players.map(p => ({
                      ...p,
                      role: game.getPlayerRole(p.token)
                    }));
                    playerSocket.emit('game-ended', {
                      winner: phaseResult.winCondition.winner,
                      winType: phaseResult.winCondition.winType,
                      details: phaseResult.winCondition.details,
                      finalRound: pGameState.currentRound,
                      playerRole: pGameState.playerRole,
                      allPlayers: enhancedPlayers,
                      votingHistory: game.votingHistory || {},
                      playerSuspicionLevels: playerSuspicionLevels
                    });
                    console.log(`[${game.gameCode}] Sent game-ended event to ${pToken}`);
                  }
                }
                return;
              }
              
              // Send on-phase-start event to each player with their individual gameState
              for (const [socketId, playerSocket] of io.sockets.sockets) {
                const pToken = playerSocket.handshake.query.token || socketId;
                
                if (game.hasPlayer(pToken)) {
                  const pGameState = gameServer.getGameStateForPlayer(pToken);
                  const phaseName = phaseResult.phase === 'night' ? 'Night Phase' : 
                                   phaseResult.phase === 'murder' ? 'Murder Discovery' :
                                   phaseResult.phase === 'trial' ? 'Trial Phase' : 
                                   phaseResult.phase === 'accusation' ? 'Accusation Vote' :
                                   phaseResult.phase === 'verdict' ? 'Verdict Phase' : phaseResult.phase;
                  
                  // Check if this player was just eliminated in this phase transition
                  let isNewlyEliminated = false;
                  if (phaseResult.previousPhase === 'night' && game.murderEliminatedPlayer === pToken) {
                    isNewlyEliminated = true;
                  } else if (phaseResult.previousPhase === 'accusation' && game.verdictEliminatedPlayer === pToken) {
                    isNewlyEliminated = true;
                  }
                  
                  if (isNewlyEliminated) {
                    // Send elimination event to newly eliminated players
                    let reason = 'You were eliminated.';
                    let verdict = 'ELIMINATED';
                    // Use previousPhase to determine elimination reason
                    if (phaseResult.previousPhase === 'night') {
                      // Eliminated during night phase = assassinated
                      reason = 'You were assassinated by the Syndicate.';
                      verdict = 'ASSASSINATED';
                    } else if (phaseResult.previousPhase === 'accusation') {
                      // Eliminated during accusation phase = voted guilty
                      reason = 'You were voted guilty and arrested.';
                      verdict = 'GUILTY';
                    }
                    playerSocket.emit('player-eliminated', {
                      playerName: pGameState.players.find(p => p.token === pToken)?.name || 'Unknown',
                      role: pGameState.playerRole,
                      reason: reason,
                      verdict: verdict,
                      round: pGameState.currentRound
                    });
                    console.log(`[${game.gameCode}] Sent elimination event to ${pToken}`);
                  } else {
                    // Send phase start to alive players
                    const phaseData = {
                      phase: phaseResult.phase === 'night' ? 1 : phaseResult.phase === 'murder' ? 2 : phaseResult.phase === 'trial' ? 3 : phaseResult.phase === 'accusation' ? 4 : phaseResult.phase === 'verdict' ? 5 : 1,
                      phaseState: pGameState,
                      phaseName: phaseName
                    };
                    
                    // Add verdict-specific data
                    if (phaseResult.phase === 'verdict' && pGameState.accusedName) {
                      phaseData.accusedName = pGameState.accusedName;
                      phaseData.guiltyCount = pGameState.guiltyVotes || 0;
                      phaseData.notGuiltyCount = pGameState.notGuiltyVotes || 0;
                    }
                    
                    playerSocket.emit('on-phase-start', phaseData);
                    console.log(`[${game.gameCode}] Sent on-phase-start (${phaseResult.phase}) to player ${pToken}`);
                  }
                }
              }
              
              // Auto-perform bot actions for the new phase
              const botPlayers = game.getBotPlayers ? game.getBotPlayers() : [];
              for (const botPlayer of botPlayers) {
                // Schedule bot action after a small delay to simulate thinking
                setTimeout(() => {
                  console.log(`[${game.gameCode}] Auto-performing action for bot ${botPlayer.name} (${botPlayer.token}) in phase ${phaseResult.phase}`);
                  const botRole = game.getPlayerRole ? game.getPlayerRole(botPlayer.token) : null;
                  const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
                  
                  let action = null;
                  
                  if (phaseResult.phase === 'night') {
                    // Use getBotAction if available (preferred approach)
                    if (game.getBotAction) {
                      action = game.getBotAction(botPlayer.token, 'night');
                    } else {
                      if (botRole === 'Syndicate' && game.getBotSyndicateNightAction) {
                        action = game.getBotSyndicateNightAction(botPlayer.token, alivePlayers);
                      } else if (botRole === 'Bodyguard' && game.getBotBodyGuardAction) {
                        action = game.getBotBodyGuardAction(botPlayer.token, alivePlayers);
                      }
                    }
                  } else if (phaseResult.phase === 'accusation' && game.getBotAccusationVote) {
                    action = game.getBotAccusationVote(botPlayer.token, alivePlayers);
                  } else if (phaseResult.phase === 'verdict' && game.getBotTrialVote) {
                    action = game.getBotTrialVote(botPlayer.token, alivePlayers);
                  }
                  
                  // Emit the bot action
                  if (action) {
                    if (action.type === 'nightVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'night-vote', { target: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for night target ${action.target}`, result);
                    } else if (action.type === 'bodyguardProtect') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'bodyguard-protect', { targetToken: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} protecting ${action.target}`, result);
                    } else if (action.type === 'accusationVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'accusation-vote', { target: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for accusation target ${action.target}`, result);
                    } else if (action.type === 'trialVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'trial-vote', { vote: action.vote });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted ${action.vote} on trial`, result);
                    }
                  }
                  
                  // Always mark bot as done with this phase (regardless of whether action was taken)
                  if (game.setPlayerDone) {
                    game.setPlayerDone(botPlayer.token);
                    console.log(`[${gameCode}] Bot ${botPlayer.name} marked as done for phase`);
                    
                    // Check if all players are now done
                    const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
                    if (allDone) {
                      console.log(`[${gameCode}] ALL PLAYERS DONE (including bots)! Auto-advancing phase`);
                      const phaseResult2 = game.advancePhase();
                      if (phaseResult2.success) {
                        // Trigger the same phase advancement logic as player-done event
                        io.to(`game-${gameCode}`).emit('game-event', {
                          eventName: 'phase-advancing',
                          payload: { fromPhase: game.currentPhase, toPhase: phaseResult2.phase }
                        });
                      }
                    }
                  }
                }, 100 + Math.random() * 100); // 100-200ms delay
              }
              
              // Clear elimination trackers after sending events
              game.murderEliminatedPlayer = null;
              game.verdictEliminatedPlayer = null;
              
              // Clear playersDone for the new phase
              game.playersDone.clear();
              console.log(`[${game.gameCode}] Cleared playersDone tracker for new phase (from accusation-vote)`);
            }
          }
        } else if (eventName === 'trial-vote') {
          // Trial vote (guilty/not guilty in phase 5)
          const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
          const trialVotes = game.trialVotes ? game.trialVotes.size : 0;
          const guiltyVotes = game.trialVotes ? Array.from(game.trialVotes.values()).filter(v => v === 'guilty').length : 0;
          
          // Broadcast vote counts to all players
          io.sockets.emit('phase5-vote-update', {
            guiltyCount: guiltyVotes,
            notGuiltyCount: trialVotes - guiltyVotes,
            totalVotes: trialVotes,
            totalPlayers: alivePlayers.length
          });
          console.log(`[${game.gameCode}] trial-vote: ${guiltyVotes} guilty, ${trialVotes - guiltyVotes} not guilty out of ${alivePlayers.length}`);
          
          const allVoted = alivePlayers.length > 0 && trialVotes === alivePlayers.length;
          console.log(`[${game.gameCode}] trial-vote check: votes=${trialVotes}, alivePlayers=${alivePlayers.length}, allVoted=${allVoted}`);
          
          if (allVoted) {
            console.log(`[${game.gameCode}] ALL PLAYERS VOTED ON VERDICT! Sending verdict result to all players`);
            
            // Calculate verdict result BEFORE advancing phase
            const notGuiltyCount = trialVotes - guiltyVotes;
            const isGuilty = guiltyVotes > notGuiltyCount;
            const accusedName = game.accusedPlayer ? 
              (game.getPlayers().find(p => p.token === game.accusedPlayer)?.name || 'Unknown') : 'Unknown';
            
            // Emit verdict result to all players
            io.sockets.emit('verdict-result', {
              accusedName: accusedName,
              guiltyCount: guiltyVotes,
              notGuiltyCount: notGuiltyCount,
              totalPlayers: alivePlayers.length,
              isGuilty: isGuilty,
              round: game.currentRound
            });
            console.log(`[${game.gameCode}] Emitted verdict-result: ${accusedName} - ${guiltyVotes} guilty, ${notGuiltyCount} not guilty`);
            
            // Initialize verdict ready tracking for all players
            game.verdictReadyPlayers = new Set();
            console.log(`[${game.gameCode}] Initialized verdictReadyPlayers tracking`);
          }
        } else if (eventName === 'verdictReady') {
          // Player acknowledged the verdict and clicked "I Understand"
          const pToken = socket.handshake.query.token || socket.id;
          const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
          
          if (!game.verdictReadyPlayers) {
            game.verdictReadyPlayers = new Set();
          }
          
          game.verdictReadyPlayers.add(pToken);
          console.log(`[${game.gameCode}] Player ${pToken} acknowledged verdict. Ready: ${game.verdictReadyPlayers.size}/${alivePlayers.length}`);
          
          // Broadcast updated count to all players
          io.sockets.emit('verdict-ready-count', {
            readyCount: game.verdictReadyPlayers.size,
            totalPlayers: alivePlayers.length
          });
          
          // Check if all players are ready
          if (game.verdictReadyPlayers.size >= alivePlayers.length) {
            console.log(`[${game.gameCode}] ALL PLAYERS ACKNOWLEDGED VERDICT! Advancing to next phase from ${game.currentPhase}`);
            
            // Advance the phase (which will execute the verdict and start next round)
            const phaseResult = game.advancePhase();
            if (phaseResult.success) {
              console.log(`[${game.gameCode}] Phase advanced to: ${phaseResult.phase}`);
              
              // Check if game ended
              if (phaseResult.gameEnded && phaseResult.winCondition) {
                // Game has ended
                console.log(`[${game.gameCode}] GAME ENDED: ${phaseResult.winCondition.winner} wins (${phaseResult.winCondition.winType})`);
                
                // Save completed game to history
                try {
                  const gameHistories = loadGameHistory();
                  gameHistories.push({
                    id: `${game.gameCode}-${Date.now()}`,
                    gameCode: game.gameCode,
                    completedAt: new Date().toISOString(),
                    playerCount: game.getPlayers().length,
                    winner: phaseResult.winCondition.winner,
                    winType: phaseResult.winCondition.winType,
                    duration: phaseResult.winCondition.duration
                  });
                  saveGameHistory(gameHistories);
                  console.log(`[HISTORY] Game ${game.gameCode} saved to history`);
                } catch (historyErr) {
                  console.error(`[HISTORY] Error saving game to history:`, historyErr);
                }
                
                // Calculate suspicion levels for all players
                const playerSuspicionLevels = {};
                game.getPlayers().forEach(player => {
                    const suspicion = game.calculateSuspicionLevel(player.token);
                    playerSuspicionLevels[player.token] = {
                        level: suspicion.level,
                        score: suspicion.suspicionScore,
                        reasons: suspicion.reasons
                    };
                });
                
                // Broadcast game-ended event to all players
                for (const [socketId, playerSocket] of io.sockets.sockets) {
                  const pToken = playerSocket.handshake.query.token || socketId;
                  if (game.hasPlayer(pToken)) {
                    const pGameState = gameServer.getGameStateForPlayer(pToken);
                    // Enhance players with role information
                    const enhancedPlayers = pGameState.players.map(p => ({
                      ...p,
                      role: game.getPlayerRole(p.token)
                    }));
                    playerSocket.emit('game-ended', {
                      winner: phaseResult.winCondition.winner,
                      winType: phaseResult.winCondition.winType,
                      details: phaseResult.winCondition.details,
                      finalRound: pGameState.currentRound,
                      playerRole: pGameState.playerRole,
                      allPlayers: enhancedPlayers,
                      votingHistory: game.votingHistory || {},
                      playerSuspicionLevels: playerSuspicionLevels
                    });
                    console.log(`[${game.gameCode}] Sent game-ended event to ${pToken}`);
                  }
                }
                return;
              }
              
              // Send on-phase-start event to each player
              for (const [socketId, playerSocket] of io.sockets.sockets) {
                const pToken = playerSocket.handshake.query.token || socketId;
                
                if (game.hasPlayer(pToken)) {
                  const pGameState = gameServer.getGameStateForPlayer(pToken);
                  const phaseName = phaseResult.phase === 'night' ? 'Night Phase' : 
                                   phaseResult.phase === 'murder' ? 'Murder Discovery' :
                                   phaseResult.phase === 'trial' ? 'Trial Phase' : 
                                   phaseResult.phase === 'accusation' ? 'Accusation Vote' :
                                   phaseResult.phase === 'verdict' ? 'Verdict Phase' : phaseResult.phase;
                  
                  // Check if this player was just eliminated by verdict (coming from verdict phase)
                  if (phaseResult.phase === 'night' && phaseResult.previousPhase === 'verdict' && game.verdictEliminatedPlayer === pToken) {
                    let reason = 'You were eliminated.';
                    let verdict = 'ELIMINATED';
                    // Eliminated during verdict phase = voted guilty
                    reason = 'The jury voted you guilty.';
                    verdict = 'GUILTY';
                    
                    playerSocket.emit('player-eliminated', {
                      playerName: pGameState.players.find(p => p.token === pToken)?.name || 'Unknown',
                      role: pGameState.playerRole,
                      reason: reason,
                      verdict: verdict,
                      round: pGameState.currentRound
                    });
                    console.log(`[${game.gameCode}] Sent verdict elimination event to ${pToken}`);
                    
                    // IMPORTANT: Still send phase-start so eliminated players can watch next round
                    const phaseData = {
                      phase: phaseResult.phase === 'night' ? 1 : phaseResult.phase === 'murder' ? 2 : phaseResult.phase === 'trial' ? 3 : phaseResult.phase === 'accusation' ? 4 : phaseResult.phase === 'verdict' ? 5 : 1,
                      phaseState: pGameState,
                      phaseName: phaseName
                    };
                    
                    playerSocket.emit('on-phase-start', phaseData);
                    console.log(`[${game.gameCode}] Sent on-phase-start (${phaseResult.phase}) to ELIMINATED player ${pToken}`);
                  } else {
                    // Send phase start to alive players
                    const phaseData = {
                      phase: phaseResult.phase === 'night' ? 1 : phaseResult.phase === 'murder' ? 2 : phaseResult.phase === 'trial' ? 3 : phaseResult.phase === 'accusation' ? 4 : phaseResult.phase === 'verdict' ? 5 : 1,
                      phaseState: pGameState,
                      phaseName: phaseName
                    };
                    
                    // Add verdict-specific data
                    if (phaseResult.phase === 'verdict' && pGameState.accusedName) {
                      phaseData.accusedName = pGameState.accusedName;
                      phaseData.guiltyCount = pGameState.guiltyVotes || 0;
                      phaseData.notGuiltyCount = pGameState.notGuiltyVotes || 0;
                    }
                    
                    playerSocket.emit('on-phase-start', phaseData);
                    console.log(`[${game.gameCode}] Sent on-phase-start (${phaseResult.phase}) to player ${pToken}`);
                  }
                }
              }
              
              // Auto-perform bot actions for the new phase
              const botPlayers = game.getBotPlayers ? game.getBotPlayers() : [];
              for (const botPlayer of botPlayers) {
                // Schedule bot action after a small delay to simulate thinking
                setTimeout(() => {
                  console.log(`[${game.gameCode}] Auto-performing action for bot ${botPlayer.name} (${botPlayer.token}) in phase ${phaseResult.phase}`);
                  const botRole = game.getPlayerRole ? game.getPlayerRole(botPlayer.token) : null;
                  const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
                  
                  let action = null;
                  
                  if (phaseResult.phase === 'night') {
                    // Use getBotAction if available (preferred approach)
                    if (game.getBotAction) {
                      action = game.getBotAction(botPlayer.token, 'night');
                    } else {
                      if (botRole === 'Syndicate' && game.getBotSyndicateNightAction) {
                        action = game.getBotSyndicateNightAction(botPlayer.token, alivePlayers);
                      } else if (botRole === 'Bodyguard' && game.getBotBodyGuardAction) {
                        action = game.getBotBodyGuardAction(botPlayer.token, alivePlayers);
                      }
                    }
                  } else if (phaseResult.phase === 'accusation' && game.getBotAccusationVote) {
                    action = game.getBotAccusationVote(botPlayer.token, alivePlayers);
                  } else if (phaseResult.phase === 'verdict' && game.getBotTrialVote) {
                    action = game.getBotTrialVote(botPlayer.token, alivePlayers);
                  }
                  
                  // Emit the bot action
                  if (action) {
                    if (action.type === 'nightVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'night-vote', { target: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for night target ${action.target}`, result);
                    } else if (action.type === 'bodyguardProtect') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'bodyguard-protect', { targetToken: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} protecting ${action.target}`, result);
                    } else if (action.type === 'accusationVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'accusation-vote', { target: action.target });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted for accusation target ${action.target}`, result);
                    } else if (action.type === 'trialVote') {
                      const result = gameServer.handleGameEvent(botPlayer.token, 'trial-vote', { vote: action.vote });
                      console.log(`[${gameCode}] Bot ${botPlayer.name} voted ${action.vote} on trial`, result);
                    }
                  }
                  
                  // Always mark bot as done with this phase (regardless of whether action was taken)
                  if (game.setPlayerDone) {
                    game.setPlayerDone(botPlayer.token);
                    console.log(`[${gameCode}] Bot ${botPlayer.name} marked as done for phase`);
                    
                    // Check if all players are now done
                    const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
                    if (allDone) {
                      console.log(`[${gameCode}] ALL PLAYERS DONE (including bots)! Auto-advancing phase`);
                      const phaseResult2 = game.advancePhase();
                      if (phaseResult2.success) {
                        // Trigger the same phase advancement logic as player-done event
                        io.to(`game-${gameCode}`).emit('game-event', {
                          eventName: 'phase-advancing',
                          payload: { fromPhase: game.currentPhase, toPhase: phaseResult2.phase }
                        });
                      }
                    }
                  }
                }, 100 + Math.random() * 100); // 100-200ms delay
              }
              
              // CRITICAL: Clear tracking for new round
              // Clear elimination trackers
              game.murderEliminatedPlayer = null;
              game.verdictEliminatedPlayer = null;
              
              // Clear verdict ready players
              game.verdictReadyPlayers = new Set();
              
              // Clear playersDone tracker so alive players can mark done for next phase
              // If we don't clear this, the server will be waiting for eliminated players
              game.playersDone.clear();
              console.log(`[${game.gameCode}] Cleared playersDone tracker for new phase`);
            }
          }
        }

        if (typeof callback === 'function') callback({ success: true, result });
      } else {
        if (typeof callback === 'function') callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error handling game event:', err);
      if (typeof callback === 'function') callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Player indicates they're ready for next phase
   */
  socket.on('player-ready', (data, callback) => {
    try {
      const game = gameServer.getPlayerGame(playerToken);
      
      if (!game) {
        if (typeof callback === 'function') callback({ success: false, message: 'Player not in a game' });
        return;
      }

      game.setPlayerReady(playerToken);
      const gameState = gameServer.getGameStateForPlayer(playerToken);

      // Notify all in game of ready status update
      io.to(`game-${game.gameCode}`).emit('player-ready-updated', {
        playerCount: gameState.readyCount,
        totalPlayers: gameState.totalPlayers,
        gameState
      });

      // Check if all players are ready - if so, emit phase-start event
      console.log(`[${game.gameCode}] Player ready: ${playerToken}, readyCount: ${gameState.readyCount}, totalPlayers: ${gameState.totalPlayers}`);
      if (game.allPlayersReady && typeof game.allPlayersReady === 'function' && game.allPlayersReady()) {
        console.log(`[${game.gameCode}] ALL PLAYERS READY! Broadcasting on-phase-start to each player`);
        // All players ready - emit phase-start to trigger game flow
        // Send to each player with their individual gameState
        for (const [socketId, playerSocket] of io.sockets.sockets) {
          const playerToken = playerSocket.handshake.query.token || socketId;
          
          if (game.hasPlayer(playerToken)) {
            const playerGameState = gameServer.getGameStateForPlayer(playerToken);
            playerSocket.emit('on-phase-start', {
              phase: 1,
              phaseState: playerGameState,
              phaseName: 'Night Phase'
            });
            console.log(`[${game.gameCode}] Sent on-phase-start to player ${playerToken} with role: ${playerGameState.playerRole}`);
          }
        }
        
        // Auto-perform bot actions for current phase
        console.log(`[${game.gameCode}] Auto-performing bot actions for phase`);
        const botPlayersPhase = game.getBotPlayers ? game.getBotPlayers() : [];
        for (const botPlayer of botPlayersPhase) {
          const botRole = game.getPlayerRole ? game.getPlayerRole(botPlayer.token) : null;
          const alivePlayers = game.getAlivePlayers ? game.getAlivePlayers() : [];
          
          console.log(`[${game.gameCode}] Processing bot ${botPlayer.name} [${botRole}]`);
          
          let action = null;
          
          // Get bot action based on role and phase
          if (game.getBotAction) {
            action = game.getBotAction(botPlayer.token, 'night'); // night phase for getBotAction
          } else if (game.getBotSyndicateNightAction && botRole === 'Syndicate') {
            action = game.getBotSyndicateNightAction(botPlayer.token, alivePlayers);
          } else if (game.getBotBodyGuardAction && botRole === 'BodyGuard') {
            action = game.getBotBodyGuardAction(botPlayer.token, alivePlayers);
          }
          
          // Execute action if bot has one
          if (action) {
            console.log(`[${game.gameCode}] Bot ${botPlayer.name} executing action:`, action);
            if (action.type === 'nightVote') {
              gameServer.handleGameEvent(botPlayer.token, 'night-vote', { target: action.target });
              // Broadcast bot action to all players
              io.to(`game-${game.gameCode}`).emit('game-event', {
                eventName: 'bot-action-performed',
                payload: {
                  playerName: botPlayer.name,
                  action: 'voted for assassination target'
                }
              });
            } else if (action.type === 'bodyguardProtect') {
              gameServer.handleGameEvent(botPlayer.token, 'bodyguard-protect', { targetToken: action.target });
              // Broadcast bot action to all players
              io.to(`game-${game.gameCode}`).emit('game-event', {
                eventName: 'bot-action-performed',
                payload: {
                  playerName: botPlayer.name,
                  action: 'chose protection target'
                }
              });
            }
          } else {
            console.log(`[${game.gameCode}] Bot ${botPlayer.name} [${botRole}] has no action for this phase (OK - passive role)`);
          }
          
          // Always mark bot as done - whether they had an action or not
          if (game.setPlayerDone) {
            game.setPlayerDone(botPlayer.token);
            console.log(`[${game.gameCode}] Bot ${botPlayer.name} marked done for phase`);
            
            // Broadcast to all players that this bot is done (for UI counter updates)
            io.to(`game-${game.gameCode}`).emit('player-done-notification', {
              playerToken: botPlayer.token,
              playerName: botPlayer.name,
              isDone: true
            });
          }
        }
        
        // Check if all players are done
        const allDone = game.allPlayersDone && typeof game.allPlayersDone === 'function' ? game.allPlayersDone() : false;
        console.log(`[${game.gameCode}] All players done check: ${allDone}`);
        
        if (allDone) {
          console.log(`[${game.gameCode}] AUTO-ADVANCING PHASE!`);
          const phaseResult = game.advancePhase();
          if (phaseResult.success) {
            io.to(`game-${game.gameCode}`).emit('game-event', {
              eventName: 'phase-advancing',
              payload: { fromPhase: game.currentPhase, toPhase: phaseResult.phase }
            });
          }
        }
      } else {
        console.log(`[${game.gameCode}] Not all players ready yet`);
      }

      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      console.error('Error marking player ready:', err);
      if (typeof callback === 'function') callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Player rejoin attempt - when they reconnect after refresh
   */
  socket.on('rejoin-game', (data) => {
    try {
      const { gameCode, playerToken: clientToken } = data;
      console.log(`Player attempting rejoin: gameCode=${gameCode}, clientToken=${clientToken}`);

      // Check if game exists
      const game = gameServer.games.get(gameCode);
      if (!game) {
        console.log(`Game ${gameCode} not found`);
        socket.emit('rejoin-rejected', { message: 'Game not found' });
        return;
      }

      // Debug: log all players in the game
      console.log(`Game ${gameCode} has players: ${Array.from(game.players.keys()).join(', ')}`);
      console.log(`Checking if game has player: ${clientToken}`);
      
      // Check if player is in the game
      if (!game.hasPlayer(clientToken)) {
        console.log(`Player ${clientToken} NOT found in game ${gameCode}`);
        socket.emit('rejoin-rejected', { message: 'Player not in game' });
        return;
      }
      
      console.log(`Player ${clientToken} found in game ${gameCode}`);

      // Rejoin successful - add socket to game room
      socket.join(`game-${gameCode}`);
      
      const gameState = gameServer.getGameStateForPlayer(clientToken);
      
      console.log(`Player ${clientToken} rejoined game ${gameCode}`);
      socket.emit('rejoin-accepted', {
        gameCode,
        game: gameServer.getGameLobbyInfo(gameCode),
        gameState: gameState
      });

      // Notify other players that player reconnected
      io.to(`game-${gameCode}`).emit('player-reconnected', {
        playerToken: clientToken,
        playerName: game.getPlayer(clientToken).name,
        game: gameServer.getGameLobbyInfo(gameCode)
      });
    } catch (err) {
      console.error('Error during rejoin:', err);
      socket.emit('rejoin-rejected', { message: 'Server error during rejoin' });
    }
  });

  // ===== FLAG GUARDIANS GAME EVENTS =====

  /**
   * Create Flag Guardians game
   */
  socket.on('game:create', (data, callback) => {
    try {
      const { playerName } = data;
      console.log(`[GAME:CREATE] Creating Flag Guardians game for player: ${playerName}, socket token: ${playerToken}`);

      const result = gameServer.createGame('flagguardians', playerToken, playerName);
      console.log(`[GAME:CREATE] Game creation result:`, result);
      
      if (result.success) {
        const gameCode = result.gameCode;
        console.log(`[GAME:CREATE] Game created successfully with code: ${gameCode}`);
        socket.join(`game-${gameCode}`);

        // Broadcast game created event
        io.to(`game-${gameCode}`).emit('game:created', {
          gameCode,
          playerName,
          playerToken,
          players: result.game?.players || [],
          isHost: result.isHost
        });

        console.log(`[GAME:CREATE] Sending callback with success`);
        callback({ 
          success: true, 
          gameCode, 
          playerToken,
          players: result.game?.players || []
        });
      } else {
        console.log(`[GAME:CREATE] Game creation failed: ${result.message}`);
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('[GAME:CREATE] Error creating Flag Guardians game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Join Flag Guardians game
   */
  socket.on('game:join', (data, callback) => {
    try {
      const { gameCode, playerName } = data;
      console.log(`Player ${playerName} joining Flag Guardians game: ${gameCode}`);

      const result = gameServer.joinGame(gameCode, playerToken, playerName);
      
      if (result.success) {
        socket.join(`game-${gameCode}`);

        // Broadcast player joined
        const game = gameServer.getGame(gameCode);
        io.to(`game-${gameCode}`).emit('lobby:player-joined', {
          playerName,
          playerToken,
          players: result.game.players,
          redTeam: game.redTeam,
          blueTeam: game.blueTeam
        });

        callback({ 
          success: true, 
          gameCode, 
          playerToken,
          players: result.game.players
        });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error joining Flag Guardians game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Select team in Flag Guardians
   */
  socket.on('lobby:select-team', (data, callback) => {
    try {
      const { gameCode, team } = data;
      const game = gameServer.getGame(gameCode);

      if (!game) {
        callback({ success: false, message: 'Game not found' });
        return;
      }

      const result = game.selectTeam(playerToken, team);
      
      if (result.success) {
        // Broadcast team selection
        io.to(`game-${gameCode}`).emit('lobby:updated', {
          players: game.getPlayers(),
          redTeam: game.redTeam,
          blueTeam: game.blueTeam,
          currentPhase: game.currentPhase
        });

        callback({ success: true });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error selecting team:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Start Flag Guardians game
   */
  socket.on('game:start', (data, callback) => {
    try {
      const { gameCode } = data;
      const game = gameServer.getGame(gameCode);

      if (!game) {
        callback({ success: false, message: 'Game not found' });
        return;
      }

      if (game.host !== playerToken) {
        callback({ success: false, message: 'Only host can start game' });
        return;
      }

      const result = game.startGame();
      
      if (result.success) {
        // Broadcast game started
        io.to(`game-${gameCode}`).emit('game:started', {
          gameState: result.gameState,
          redTeam: game.redTeam,
          blueTeam: game.blueTeam,
          currentRound: game.currentRound
        });

        callback({ success: true });
      } else {
        callback({ success: false, message: result.message });
      }
    } catch (err) {
      console.error('Error starting game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Leave Flag Guardians game
   */
  socket.on('game:leave', (data, callback) => {
    try {
      const { gameCode } = data;
      const game = gameServer.getGame(gameCode);

      if (game) {
        game.removePlayer(playerToken);
        socket.leave(`game-${gameCode}`);

        if (game.isEmpty()) {
          gameServer.games.delete(gameCode);
        } else {
          // Notify remaining players
          io.to(`game-${gameCode}`).emit('lobby:player-left', {
            playerToken,
            players: game.getPlayers(),
            redTeam: game.redTeam,
            blueTeam: game.blueTeam,
            isHost: game.host
          });
        }
      }

      callback({ success: true });
    } catch (err) {
      console.error('Error leaving game:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Disconnect handler
   */
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Remove player from game
    const game = gameServer.getPlayerGame(playerToken);
    if (game) {
      const gameCode = game.gameCode;
      gameServer.removePlayerFromGame(playerToken);
      
      // Notify other players
      io.to(`game-${gameCode}`).emit('player-disconnected', {
        playerToken,
        game: gameServer.getGameLobbyInfo(gameCode)
      });
    }
  });

  /**
   * Play Again - Create new lobby with same players
   */
  socket.on('play-again', (data, callback) => {
    try {
      const { gameCode: oldGameCode } = data;
      console.log(`Play Again requested for game ${oldGameCode} by player ${playerToken}`);
      
      // Get the old game
      const oldGame = gameServer.games.get(oldGameCode);
      if (!oldGame) {
        return callback({ success: false, message: 'Game not found' });
      }
      
      // Get all players from old game (including eliminated)
      const allPlayers = oldGame.getPlayers();
      if (allPlayers.length === 0) {
        return callback({ success: false, message: 'No players in game' });
      }
      
      // Determine original host
      const originalHost = oldGame.hostToken;
      const hostPlayer = allPlayers.find(p => p.token === originalHost) || allPlayers[0];
      
      // Create new game with the host
      const createResult = gameServer.createGame('secretsyndicates', hostPlayer.token, hostPlayer.name);
      if (!createResult.success) {
        return callback({ success: false, message: 'Failed to create new game' });
      }
      
      const newGameCode = createResult.gameCode;
      const newGame = gameServer.games.get(newGameCode);
      
      // Copy settings from old game
      if (oldGame.settings && newGame) {
        newGame.settings = { ...oldGame.settings };
      }
      
      // Add all other players to the new game
      for (const player of allPlayers) {
        if (player.token !== hostPlayer.token) {
          gameServer.joinGame(newGameCode, player.token, player.name);
        }
      }
      
      // Move all players' sockets to new game room
      for (const [socketId, playerSocket] of io.sockets.sockets) {
        const pToken = playerSocket.handshake.query.token || socketId;
        const playerInGame = allPlayers.find(p => p.token === pToken);
        
        if (playerInGame) {
          // Leave old room, join new room
          playerSocket.leave(`game-${oldGameCode}`);
          playerSocket.join(`game-${newGameCode}`);
          
          // Send play-again-lobby event to each player
          const isHost = pToken === hostPlayer.token;
          playerSocket.emit('play-again-lobby', {
            gameCode: newGameCode,
            game: gameServer.getGameLobbyInfo(newGameCode),
            isHost: isHost
          });
          console.log(`Moved player ${pToken} to new game ${newGameCode}, isHost: ${isHost}`);
        }
      }
      
      // Clean up old game
      gameServer.games.delete(oldGameCode);
      console.log(`Deleted old game ${oldGameCode}, created new game ${newGameCode}`);
      
      callback({ success: true, gameCode: newGameCode });
    } catch (err) {
      console.error('Error in play-again:', err);
      callback({ success: false, message: 'Server error' });
    }
  });

  /**
   * Debug: List active games (remove in production)
   */
  socket.on('debug-games', (callback) => {
    const games = [];
    for (const [code, game] of gameServer.games) {
      games.push({
        code,
        type: game.gameType,
        state: game.gameState,
        players: game.getPlayerCount()
      });
    }
    callback({ games });
  });

  /**
   * Admin: Get list of all games
   */
  socket.on('admin-get-games', (data, callback) => {
    console.log(`[ADMIN] admin-get-games requested, games in server: ${gameServer.games.size}`);
    const games = {};
    for (const [code, game] of gameServer.games) {
      console.log(`[ADMIN] Found game ${code}: status=${game.gameState}`);
      games[code] = {
        status: game.gameState,
        players: game.getPlayers() || [],
        phase: game.currentPhase || 'Unknown',
        playerCount: (game.getPlayers() || []).length,
        timestamp: Date.now()
      };
    }
    console.log(`[ADMIN] Sending ${Object.keys(games).length} games to admin`);
    if (typeof callback === 'function') {
      callback(games);
    }
  });

  /**
   * Admin: Start watching a specific game
   */
  socket.on('admin-watch-game', (data) => {
    if (!data.gameCode) return;
    
    socket.join(`admin-watch-${data.gameCode}`);
    console.log(`[ADMIN] Admin joined watch room for game ${data.gameCode}`);
    
    // Send initial state for all players
    const game = gameServer.games.get(data.gameCode);
    if (game) {
      const players = game.getPlayers() || [];
      console.log(`[ADMIN] Sending initial state for ${players.length} players in game ${data.gameCode}`);
      
      for (const player of players) {
        const playerState = gameServer.getGameStateForPlayer(player.token);
        const playerIsReady = game.playersReady && game.playersReady.has(player.token);
        
        // Determine what screen the player is viewing
        // If player hasn't clicked "I'm Ready" yet, they're on role-screen
        // Otherwise, they're on whatever phase the game is in
        let screenType = 'role-screen'; // default to role screen
        if (playerIsReady && game.currentPhase && game.currentPhase !== 'not-started' && game.currentPhase !== 'waiting') {
          // Player is ready and game has started phases - use current phase
          screenType = game.currentPhase;
        } else if (player.role && !playerIsReady) {
          // Player has role but hasn't clicked ready yet - they're viewing role screen
          screenType = 'role-screen';
        } else if (!player.role) {
          // Player doesn't have role yet - they're in lobby
          screenType = 'lobby-screen';
        }
        
        console.log(`[ADMIN] Player ${player.name}: role=${player.role}, isReady=${playerIsReady}, screen=${screenType}`);
        socket.emit('player-state-update', {
          gameCode: data.gameCode,
          playerToken: player.token,
          playerName: player.name,
          role: player.role || playerState?.playerRole || 'Unknown',
          alive: player.alive,
          phase: game.currentPhase,
          screen: screenType,
          playerIsReady: playerIsReady,
          action: 'join-game',
          actionDetails: {
            playerName: player.name,
            role: player.role || playerState?.playerRole || 'Unknown'
          },
          gameState: playerState
        });
      }
    }
  });

  /**
   * Admin: Stop watching a game
   */
  socket.on('admin-stop-watching', () => {
    // Leave all admin watch rooms
    for (const room of socket.rooms) {
      if (room.startsWith('admin-watch-')) {
        socket.leave(room);
      }
    }
  });
});


// TEST ENDPOINT - Creates a pre-populated game for quick testing
app.get('/test-game', (req, res) => {
  try {
    // Get query parameters with defaults
    const playerCount = Math.min(Math.max(parseInt(req.query.playerCount) || 5, 3), 10); // 3-10 players
    const startRound = Math.min(Math.max(parseInt(req.query.startRound) || 1, 1), 20); // 1-20 rounds
    const enableEyeWitness = req.query.enableEyeWitness !== 'false'; // Default true
    const enableBodyGuard = req.query.enableBodyGuard !== 'false'; // Default true
    
    // Create player names - real names instead of A, B, C
    const nameOptions = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
    const playerNames = nameOptions.slice(0, playerCount);
    const playerTokens = [];
    
    // Create the game with first player
    const createResult = gameServer.createGame('secretsyndicates', 'test-player-1', playerNames[0]);
    if (!createResult.success) {
      return res.json({ success: false, message: 'Failed to create game' });
    }
    
    const gameCode = createResult.gameCode;
    const game = gameServer.games.get(gameCode);
    
    // Apply game settings
    if (game) {
      game.settings.enableEyeWitness = enableEyeWitness;
      game.settings.enableBodyGuard = enableBodyGuard;
    }
    
    playerTokens.push('test-player-1');
    
    // Add remaining players
    for (let i = 1; i < playerNames.length; i++) {
      const token = `test-player-${i + 1}`;
      gameServer.joinGame(gameCode, token, playerNames[i]);
      playerTokens.push(token);
    }
    
    // Start the game
    gameServer.startGame(gameCode, 'test-player-1');
    
    // If startRound > 1, advance the game to that round
    if (startRound > 1 && game) {
      console.log(`[TEST] Advancing game ${gameCode} to round ${startRound}...`);
      // Simple round advancement: just advance the phase the correct number of times
      // Each round is: night -> murder -> trial -> accusation -> verdict (5 phases)
      const phasesPerRound = 5;
      const totalPhaseAdvancements = (startRound - 1) * phasesPerRound;
      
      for (let i = 0; i < totalPhaseAdvancements; i++) {
        // For each phase, we need to populate minimal data to allow advancement
        const alivePlayers = game.getAlivePlayers();
        
        // Auto-fill votes based on current phase
        if (game.currentPhase === 'night' && alivePlayers.length > 0) {
          const syndicate = game.getSyndicateMembers();
          if (syndicate.length > 0) {
            const targets = alivePlayers.filter(p => !syndicate.some(s => s.token === p.token));
            if (targets.length > 0) {
              const randomTarget = targets[Math.floor(Math.random() * targets.length)];
              for (const member of syndicate) {
                if (!game.nightVotesLocked.has(member.token)) {
                  game.nightVote(member.token, randomTarget.token);
                  game.lockNightVotes(member.token);
                }
              }
            }
          }
        }
        
        if (game.currentPhase === 'accusation' && alivePlayers.length > 0) {
          // Auto-vote for accusation phase
          for (const player of alivePlayers) {
            if (!game.accusationVotes.has(player.token)) {
              const targets = alivePlayers.filter(p => p.token !== player.token);
              if (targets.length > 0) {
                const randomTarget = targets[Math.floor(Math.random() * targets.length)];
                game.accusationVote(player.token, randomTarget.token);
              }
            }
          }
        }
        
        if (game.currentPhase === 'verdict' && alivePlayers.length > 0 && game.accusedPlayer) {
          // Auto-vote for verdict phase
          for (const player of alivePlayers) {
            if (!game.trialVotes.has(player.token)) {
              game.trialVote(player.token, Math.random() > 0.5 ? 'guilty' : 'not-guilty');
            }
          }
        }
        
        // Advance to next phase
        game.advancePhase();
      }
    }
    
    console.log(`[TEST] Created game ${gameCode} with ${playerCount} players starting at round ${startRound} (eyeWitness: ${enableEyeWitness}, bodyGuard: ${enableBodyGuard})`);
    
    // Generate player response with dynamic count
    const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A9DFBF'];
    const players = playerNames.map((name, index) => ({
      name,
      token: `test-player-${index + 1}`,
      color: playerColors[index]
    }));
    
    res.json({
      success: true,
      gameCode: gameCode,
      players: players
    });
  } catch (err) {
    console.error('Error creating test game:', err);
    res.json({ success: false, message: 'Server error' });
  }
});

app.get('/test-results', (req, res) => {
  try {
    const winner = req.query.winner || 'innocent'; // 'innocent' or 'syndicate'
    
    // Create a simple test game with pre-determined results
    const playerCount = 5;
    const playerNames = ['A', 'B', 'C', 'D', 'E'];
    const playerTokens = [];
    
    // Create the game
    const createResult = gameServer.createGame('secretsyndicates', 'test-player-1', playerNames[0]);
    if (!createResult.success) {
      return res.json({ success: false, message: 'Failed to create game' });
    }
    
    const gameCode = createResult.gameCode;
    const game = gameServer.games.get(gameCode);
    
    playerTokens.push('test-player-1');
    
    // Add remaining players
    for (let i = 1; i < playerNames.length; i++) {
      const token = `test-player-${i + 1}`;
      gameServer.joinGame(gameCode, token, playerNames[i]);
      playerTokens.push(token);
    }
    
    // Start the game
    gameServer.startGame(gameCode, 'test-player-1');
    
    // Assign roles manually for consistent results
    if (game) {
      game.roles.clear();
      // Initialize eliminatedPlayers if it doesn't exist
      if (!game.eliminatedPlayers) {
        game.eliminatedPlayers = new Set();
      }
      
      // Assign roles: player-1 is Syndicate, others are Innocent/Detective/etc
      game.roles.set('test-player-1', 'Syndicate');
      game.roles.set('test-player-2', 'Detective');
      game.roles.set('test-player-3', 'Bystander');
      game.roles.set('test-player-4', 'Bystander');
      game.roles.set('test-player-5', 'Bystander');
      
      // Manually set game to ended state with results
      game.currentPhase = 'ended';
      game.currentRound = 3;
      
      // Set which team wins
      if (winner === 'syndicate') {
        // Eliminate innocent players
        game.eliminatedPlayers.add('test-player-2');
        game.eliminatedPlayers.add('test-player-3');
      } else {
        // Eliminate the syndicate
        game.eliminatedPlayers.add('test-player-1');
      }
    }
    
    console.log(`[TEST] Created results view game ${gameCode} with ${winner} winning`);
    
    const playerColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'];
    const players = playerNames.map((name, index) => ({
      name,
      token: `test-player-${index + 1}`,
      color: playerColors[index]
    }));
    
    res.json({
      success: true,
      gameCode: gameCode,
      players: players,
      winner: winner
    });
  } catch (err) {
    console.error('Error creating test results:', err);
    res.json({ success: false, message: 'Server error' });
  }
});

const PORT = process.env.PORT || 8443;

server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Socket.IO server running at wss://gamehappy.app/websocket`);
  console.log('Ready to handle: secretsyndicates, flagguardians, and future games');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  io.close(() => {
    console.log('Socket.IO server closed');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('[SIGINT] Shutting down gracefully...');
  io.close(() => {
    console.log('Socket.IO server closed');
    process.exit(0);
  });
});

// Error handling
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Promise:', promise, 'Reason:', reason);
});
