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
     * Add bot players to the game
     */
    addBotPlayers(count) {
        const botNames = [
            'Echo', 'Cipher', 'Nexus', 'Venom', 'Raven', 'Shadow', 'Phantom', 'Ghost',
            'Specter', 'Whisper', 'Wraith', 'Shade', 'Reaper', 'Oracle', 'Sentinel'
        ];
        
        // Get existing bot names to avoid duplicates
        const existingBotNames = new Set();
        for (const player of this.players.values()) {
            if (player.isBot) {
                existingBotNames.add(player.name);
            }
        }
        
        // Find available names
        const availableNames = botNames.filter(name => !existingBotNames.has(name));
        
        const addedBots = [];
        
        for (let i = 0; i < count && availableNames.length > 0; i++) {
            // Get next available bot name
            const botName = availableNames.shift();
            
            // Generate unique token for bot
            const botToken = `bot_${this.gameCode}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Add bot as player
            const result = this.addPlayer(botToken, botName);
            if (result.success) {
                // Mark as bot in player data
                const playerData = this.players.get(botToken);
                playerData.isBot = true;
                playerData.botToken = botToken;
                addedBots.push({ token: botToken, name: botName });
            }
        }
        
        return {
            success: addedBots.length > 0,
            botsAdded: addedBots,
            count: addedBots.length
        };
    }

    /**
     * Get all bot players
     */
    getBotPlayers() {
        return Array.from(this.players.values()).filter(p => p.isBot);
    }

    /**
     * Check if a player is a bot
     */
    isBot(playerToken) {
        const player = this.players.get(playerToken);
        return player && player.isBot === true;
    }

    /**
     * Get all human players
     */
    getHumanPlayers() {
        return Array.from(this.players.values()).filter(p => !p.isBot);
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
