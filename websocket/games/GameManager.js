// Base GameManager class - extend this for each game
class GameManager {
    constructor(gameCode, gameType) {
        this.gameCode = gameCode;
        this.gameType = gameType;
        this.players = new Map(); // playerToken -> player data
        this.gameState = 'waiting'; // waiting, started, ended
        this.host = null;
        this.createdAt = Date.now();
    }

    /**
     * Add a player to the game
     * @param {string} playerToken - Unique player token
     * @param {string} playerName - Player's display name
     * @returns {object} Player data or error
     */
    addPlayer(playerToken, playerName) {
        if (this.players.has(playerToken)) {
            return { success: false, message: 'Player already in game' };
        }

        const playerData = {
            token: playerToken,
            name: playerName,
            joinedAt: Date.now(),
            isHost: this.players.size === 0 // First player is host
        };

        if (playerData.isHost) {
            this.host = playerToken;
        }

        this.players.set(playerToken, playerData);
        return { success: true, player: playerData };
    }

    /**
     * Remove a player from the game
     */
    removePlayer(playerToken) {
        if (!this.players.has(playerToken)) {
            return false;
        }

        this.players.delete(playerToken);

        // If host left, assign new host
        if (this.host === playerToken && this.players.size > 0) {
            const newHost = Array.from(this.players.keys())[0];
            this.players.get(newHost).isHost = true;
            this.host = newHost;
        }

        return true;
    }

    /**
     * Get all players data
     */
    getPlayers() {
        return Array.from(this.players.values());
    }

    /**
     * Get player by token
     */
    getPlayer(playerToken) {
        return this.players.get(playerToken);
    }

    /**
     * Get player count
     */
    getPlayerCount() {
        return this.players.size;
    }

    /**
     * Check if player exists
     */
    hasPlayer(playerToken) {
        return this.players.has(playerToken);
    }

    /**
     * Check if game can start (override in subclass)
     */
    canStart() {
        return this.players.size >= 2; // Default: at least 2 players
    }

    /**
     * Start the game (override in subclass)
     */
    startGame() {
        this.gameState = 'started';
        return { success: true, message: 'Game started' };
    }

    /**
     * Handle game-specific events (override in subclass)
     */
    handleEvent(eventName, playerToken, data) {
        throw new Error('handleEvent not implemented in subclass');
    }

    /**
     * Get current game state (override in subclass)
     */
    getGameState() {
        return {
            gameCode: this.gameCode,
            gameType: this.gameType,
            gameState: this.gameState,
            players: this.getPlayers(),
            playerCount: this.getPlayerCount()
        };
    }

    /**
     * Check if game is empty
     */
    isEmpty() {
        return this.players.size === 0;
    }

    /**
     * Get game info for lobby
     */
    getLobbyInfo() {
        return {
            gameCode: this.gameCode,
            gameType: this.gameType,
            playerCount: this.getPlayerCount(),
            players: this.getPlayers(),
            host: this.host,
            gameState: this.gameState,
            createdAt: this.createdAt
        };
    }
}

module.exports = GameManager;
