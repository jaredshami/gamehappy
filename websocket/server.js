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

// Add CORS headers for HTTP requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://gamehappy.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize game server
const gameServer = new GameServer();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Generate unique player token (could use existing token from client)
  const playerToken = socket.handshake.query.token || socket.id;

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
            console.log(`[${game.gameCode}] ALL PLAYERS VOTED ON VERDICT! Advancing to next phase from ${game.currentPhase}`);
            
            // Advance the phase (which will execute the verdict)
            const phaseResult = game.advancePhase();
            if (phaseResult.success) {
              console.log(`[${game.gameCode}] Phase advanced to: ${phaseResult.phase}`);
              
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

      // Check if game exists
      const game = gameServer.games.get(gameCode);
      if (!game) {
        socket.emit('rejoin-rejected', { message: 'Game not found' });
        return;
      }

      // Check if player is in the game
      if (!game.hasPlayer(clientToken)) {
        socket.emit('rejoin-rejected', { message: 'Player not in game' });
        return;
      }

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
});

// TEST ENDPOINT - Creates a pre-populated game for quick testing
app.get('/test-game', (req, res) => {
  try {
    // Create game with 5 pre-populated players
    const playerNames = ['A', 'B', 'C', 'D', 'E'];
    const playerTokens = [];
    
    // Create the game with player A
    const createResult = gameServer.createGame('secretsyndicates', 'test-player-1', 'A');
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
    
    console.log(`[TEST] Created game ${gameCode} with 5 players`);
    
    // Return game info with player tokens
    res.json({
      success: true,
      gameCode: gameCode,
      players: [
        { name: 'A', token: 'test-player-1', color: '#FF6B6B' },
        { name: 'B', token: 'test-player-2', color: '#4ECDC4' },
        { name: 'C', token: 'test-player-3', color: '#45B7D1' },
        { name: 'D', token: 'test-player-4', color: '#FFA07A' },
        { name: 'E', token: 'test-player-5', color: '#98D8C8' }
      ]
    });
  } catch (err) {
    console.error('Error creating test game:', err);
    res.json({ success: false, message: 'Server error' });
  }
});

server.listen(8443, () => {
  console.log('Socket.IO server running at wss://gamehappy.app/websocket');
  console.log('Ready to handle: secretsyndicates and future games');
});
