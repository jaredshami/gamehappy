const SecretSyndicates = require('./SecretSyndicates');
const FlagGuardians = require('./FlagGuardians');
const RockPaperScissorsPsych = require('./RockPaperScissorsPsych');

class GameServer {
    constructor() {
        this.games = new Map(); // gameCode -> game instance
        this.playerSessions = new Map(); // playerToken -> { gameCode, playerName }
    }

    /**
     * Create a new game
     */
    createGame(gameType, playerToken, playerName) {
        // Generate a unique game code
        const gameCode = this.generateGameCode();

        let game;
        
        if (gameType === 'secretsyndicates') {
            game = new SecretSyndicates(gameCode);
        } else if (gameType === 'flagguardians') {
            game = new FlagGuardians(gameCode);
        } else if (gameType === 'rockpaperscissorspsych') {
            game = new RockPaperScissorsPsych(gameCode);
        } else {
            return { success: false, message: 'Unknown game type' };
        }

        // Add the creator as first player
        const result = game.addPlayer(playerToken, playerName);
        if (!result.success) {
            return result;
        }

        // Save the game
        this.games.set(gameCode, game);
        this.playerSessions.set(playerToken, {
            gameCode,
            playerName,
            gameType
        });

        return {
            success: true,
            gameCode,
            game: game.getLobbyInfo(),
            isHost: true
        };
    }

    /**
     * Join an existing game
     */
    joinGame(gameCode, playerToken, playerName) {
        // Check if game exists
        const game = this.games.get(gameCode);
        if (!game) {
            return { success: false, message: 'Game not found' };
        }

        // Check if game already started
        if (game.gameState !== 'waiting') {
            return { success: false, message: 'Game already started' };
        }

        // Add player to game
        const result = game.addPlayer(playerToken, playerName);
        if (!result.success) {
            return result;
        }

        // Save session
        this.playerSessions.set(playerToken, {
            gameCode,
            playerName,
            gameType: game.gameType
        });

        return {
            success: true,
            gameCode,
            game: game.getLobbyInfo(),
            isHost: result.player.isHost
        };
    }

    /**
     * Get game by code
     */
    getGame(gameCode) {
        return this.games.get(gameCode);
    }

    /**
     * Get player's current game
     */
    getPlayerGame(playerToken) {
        const session = this.playerSessions.get(playerToken);
        if (!session) return null;
        return this.getGame(session.gameCode);
    }

    /**
     * Get game state for player
     */
    getGameStateForPlayer(playerToken) {
        const game = this.getPlayerGame(playerToken);
        if (!game) return null;
        return game.getGameStateForPlayer(playerToken);
    }

    /**
     * Remove player from game
     */
    removePlayerFromGame(playerToken) {
        const game = this.getPlayerGame(playerToken);
        if (!game) return false;

        game.removePlayer(playerToken);
        
        // If game is empty, delete it
        if (game.isEmpty()) {
            this.games.delete(game.gameCode);
        }

        this.playerSessions.delete(playerToken);
        return true;
    }

    /**
     * Start a game
     */
    startGame(gameCode, playerToken) {
        const game = this.getGame(gameCode);
        if (!game) {
            return { success: false, message: 'Game not found' };
        }

        // Check if player is host
        if (game.host !== playerToken) {
            return { success: false, message: 'Only host can start game' };
        }

        return game.startGame();
    }

    /**
     * Handle game event
     */
    handleGameEvent(playerToken, eventName, data) {
        const game = this.getPlayerGame(playerToken);
        if (!game) {
            return { success: false, message: 'Player not in a game' };
        }

        return game.handleEvent(eventName, playerToken, data);
    }

    /**
     * Set game settings
     */
    setGameSettings(gameCode, settings) {
        const game = this.getGame(gameCode);
        if (!game) {
            return { success: false, message: 'Game not found' };
        }

        if (typeof game.setSettings === 'function') {
            game.setSettings(settings);
            return { success: true };
        }

        return { success: false, message: 'Game does not support settings' };
    }

    /**
     * Generate unique 6-character game code (letters and numbers)
     */
    generateGameCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code;
        do {
            code = '';
            for (let i = 0; i < 4; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
        } while (this.games.has(code));
        return code;
    }

    /**
     * Get game info for lobby
     */
    getGameLobbyInfo(gameCode) {
        const game = this.getGame(gameCode);
        if (!game) return null;
        return game.getLobbyInfo();
    }

    /**
     * Clean up old games (optional - for memory management)
     */
    cleanupOldGames(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        for (const [gameCode, game] of this.games) {
            if (game.isEmpty() && (now - game.createdAt) > maxAgeMs) {
                this.games.delete(gameCode);
            }
        }
    }
}

module.exports = GameServer;
