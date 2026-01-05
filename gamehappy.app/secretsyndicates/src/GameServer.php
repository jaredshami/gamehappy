<?php

namespace Game;

use Ratchet\MessageComponentInterface;
use Ratchet\ConnectionInterface;

class GameServer implements MessageComponentInterface
{
    protected $clients;
    protected $games;
    protected $playerConnections;
    protected $playerTokens; // token => [gameCode, playerName]
    protected $disconnectedPlayers; // token => [gameCode, playerData, disconnectTime]

    public function __construct()
    {
        $this->clients = new \SplObjectStorage;
        $this->games = [];
        $this->playerConnections = [];
        $this->playerTokens = [];
        $this->disconnectedPlayers = [];
        $this->availableKeywords = $this->initializeKeywords();
    }

    private function initializeKeywords()
    {
        return [
            'Umbrella', 'Compass', 'Telescope', 'Shovel', 'Pickaxe',
            'Lantern', 'Rope', 'Hammer', 'Wrench', 'Pliers',
            'Scissors', 'Torch', 'Whistle', 'Bell', 'Horn',
            'Trumpet', 'Flute', 'Violin', 'Harp', 'Drum',
            'Tambourine', 'Marbles', 'Dice', 'Coin', 'Puzzle',
            'Scroll', 'Manuscript', 'Ledger', 'Almanac', 'Encyclopedia',
            'Quill', 'Inkwell', 'Parchment', 'Wax', 'Seal',
            'Candle', 'Wick', 'Mirror', 'Prism', 'Crystal',
            'Hourglass', 'Sundial', 'Astrolabe', 'Compass', 'Map',
            'Locket', 'Pendant', 'Bracelet', 'Ring', 'Brooch',
            'Button', 'Buckle', 'Clasp', 'Latch', 'Knot',
            'Twine', 'Thread', 'Yarn', 'Bolt', 'Nail',
            'Gear', 'Spring', 'Hinge', 'Lock', 'Key',
            'Lantern', 'Sconce', 'Chandelier', 'Brazier', 'Firepot',
            'Brazier', 'Cauldron', 'Kettle', 'Pot', 'Pan',
            'Ladle', 'Spatula', 'Fork', 'Spoon', 'Knife',
            'Plate', 'Bowl', 'Cup', 'Glass', 'Goblet',
            'Pitcher', 'Jug', 'Vial', 'Urn', 'Amphora',
            'Bottle', 'Flask', 'Tankard', 'Chalice', 'Grail',
            'Dish', 'Trencher', 'Mug', 'Stein', 'Flagon'
        ];
    }

    private function generatePlayerToken()
    {
        return bin2hex(random_bytes(16));
    }

    // Helper to get player ID - works for both normal and test games
    private function getPlayerId(ConnectionInterface $conn, $data)
    {
        // If test player ID is provided, use that
        if (isset($data['testPlayerId']) && isset($data['gameCode'])) {
            $gameCode = $data['gameCode'];
            if (isset($this->games[$gameCode]) && $this->games[$gameCode]['isTestGame'] ?? false) {
                if (isset($this->games[$gameCode]['players'][$data['testPlayerId']])) {
                    return $data['testPlayerId'];
                }
            }
        }
        // Otherwise use connection resource ID
        return $conn->resourceId;
    }

    // Helper to get game code - works for both normal and test games
    private function getGameCode(ConnectionInterface $conn, $data)
    {
        if (isset($data['gameCode']) && isset($this->games[$data['gameCode']])) {
            return $data['gameCode'];
        }
        return $this->playerConnections[$conn->resourceId] ?? null;
    }

    public function onOpen(ConnectionInterface $conn)
    {
        $this->clients->attach($conn);
        echo "New connection! ({$conn->resourceId})\n";
    }

    public function onMessage(ConnectionInterface $from, $msg)
    {
        $data = json_decode($msg, true);

        if (!$data || !isset($data['action'])) {
            return;
        }

        switch ($data['action']) {
            case 'createGame':
                $this->createGame($from, $data);
                break;
            case 'joinGame':
                $this->joinGame($from, $data);
                break;
            case 'reconnect':
                $this->reconnectPlayer($from, $data);
                break;
            case 'startGame':
                $this->startGame($from, $data);
                break;
            case 'playerReady':
                $this->playerReady($from, $data);
                break;
            // Phase 1 actions
            case 'syndicateRecommend':
                $this->handleSyndicateRecommend($from, $data);
                break;
            case 'syndicateLockIn':
                $this->handleSyndicateLockIn($from, $data);
                break;
            case 'detectiveInvestigate':
                $this->handleDetectiveInvestigate($from, $data);
                break;
            case 'detectiveLockIn':
                $this->handleDetectiveLockIn($from, $data);
                break;
            case 'updateCaseNotes':
                $this->handleUpdateCaseNotes($from, $data);
                break;
            case 'bystanderSelect':
                $this->handleBystanderSelect($from, $data);
                break;
            case 'bodyGuardProtect':
                $this->handleBodyGuardProtect($from, $data);
                break;
            case 'playerDone':
                $this->handlePlayerDone($from, $data);
                break;
            case 'playerDonePhase3':
                $this->handlePlayerDonePhase3($from, $data);
                break;
            case 'playerReadyPhase2':
                $this->handlePlayerReadyPhase2($from, $data);
                break;
            case 'continueFromPhase2':
                $this->handleContinueFromPhase2($from, $data);
                break;
            case 'playerReadyPhase3':
                $this->handlePlayerReadyPhase3($from, $data);
                break;
            case 'castVote':
                $this->handleCastVote($from, $data);
                break;
            case 'castTrialVote':
                $this->handleCastTrialVote($from, $data);
                break;
            case 'playAgain':
                $this->handlePlayAgain($from, $data);
                break;
            case 'leaveGame':
                $this->handleLeaveGame($from, $data);
                break;
            case 'removePlayer':
                $this->handleRemovePlayer($from, $data);
                break;
            default:
                echo "Unknown action: {$action}\n";
        }
    }

    public function onClose(ConnectionInterface $conn)
    {
        $this->handlePlayerDisconnect($conn);
        $this->clients->detach($conn);
        echo "Connection {$conn->resourceId} has disconnected\n";
    }

    public function onError(ConnectionInterface $conn, \Exception $e)
    {
        echo "An error has occurred: {$e->getMessage()}\n";
        $conn->close();
    }

    private function generateGameCode()
    {
        $characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        do {
            $code = '';
            for ($i = 0; $i < 4; $i++) {
                $code .= $characters[rand(0, strlen($characters) - 1)];
            }
        } while (isset($this->games[$code]));

        return $code;
    }

    private function createGame(ConnectionInterface $conn, $data)
    {
        $playerName = trim($data['playerName'] ?? '');

        if (empty($playerName)) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Player name is required'
            ]));
            return;
        }

        $gameCode = $this->generateGameCode();
        $playerToken = $this->generatePlayerToken();

        $this->games[$gameCode] = [
            'code' => $gameCode,
            'host' => $conn->resourceId,
            'hostToken' => $playerToken,
            'players' => [
                $conn->resourceId => [
                    'name' => $playerName,
                    'isHost' => true,
                    'connection' => $conn,
                    'token' => $playerToken,
                    'connected' => true
                ]
            ],
            'settings' => [
                'eyeWitness' => $data['eyeWitness'] ?? false,
                'bodyGuard' => $data['bodyGuard'] ?? false
            ],
            'status' => 'lobby'
        ];

        $this->playerConnections[$conn->resourceId] = $gameCode;
        $this->playerTokens[$playerToken] = ['gameCode' => $gameCode, 'resourceId' => $conn->resourceId];

        $conn->send(json_encode([
            'action' => 'gameCreated',
            'gameCode' => $gameCode,
            'players' => $this->getPlayerList($gameCode),
            'isHost' => true,
            'playerToken' => $playerToken
        ]));

        echo "Game created: {$gameCode} by {$playerName}\n";
    }

    private function joinGame(ConnectionInterface $conn, $data)
    {
        $playerName = trim($data['playerName'] ?? '');
        $gameCode = strtoupper(trim($data['gameCode'] ?? ''));

        if (empty($playerName)) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Player name is required'
            ]));
            return;
        }

        if (!isset($this->games[$gameCode])) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Game not found'
            ]));
            return;
        }

        if ($this->games[$gameCode]['status'] !== 'lobby') {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Game has already started'
            ]));
            return;
        }

        // Check for duplicate names
        foreach ($this->games[$gameCode]['players'] as $player) {
            if (strtolower($player['name']) === strtolower($playerName)) {
                $conn->send(json_encode([
                    'action' => 'error',
                    'message' => 'That name is already taken'
                ]));
                return;
            }
        }

        $playerToken = $this->generatePlayerToken();

        $this->games[$gameCode]['players'][$conn->resourceId] = [
            'name' => $playerName,
            'isHost' => false,
            'connection' => $conn,
            'token' => $playerToken,
            'connected' => true
        ];

        $this->playerConnections[$conn->resourceId] = $gameCode;
        $this->playerTokens[$playerToken] = ['gameCode' => $gameCode, 'resourceId' => $conn->resourceId];

        // Send confirmation to joining player
        $conn->send(json_encode([
            'action' => 'gameJoined',
            'gameCode' => $gameCode,
            'players' => $this->getPlayerList($gameCode),
            'isHost' => false,
            'playerToken' => $playerToken
        ]));

        // Broadcast updated player list to all players in the game
        $this->broadcastToGame($gameCode, [
            'action' => 'playerListUpdate',
            'players' => $this->getPlayerList($gameCode)
        ]);

        echo "Player {$playerName} joined game {$gameCode}\n";
    }

    private function startGame(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);

        echo "startGame called - gameCode: {$gameCode}, playerId: {$playerId} (type: " . gettype($playerId) . ")\n";

        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "startGame: Game not found\n";
            return;
        }

        $game = &$this->games[$gameCode];

        echo "startGame: game status = {$game['status']}, host = {$game['host']} (type: " . gettype($game['host']) . ")\n";
        echo "startGame: host === playerId? " . ($game['host'] === $playerId ? 'YES' : 'NO') . ", host == playerId? " . ($game['host'] == $playerId ? 'YES' : 'NO') . "\n";

        // Only host can start (use loose comparison to handle int/string mismatch)
        if ($game['host'] != $playerId) {
            echo "startGame: Not host - game host is {$game['host']}, player is {$playerId}\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Only the host can start the game'
            ]));
            return;
        }

        // Check game status
        if ($game['status'] !== 'lobby') {
            echo "startGame: Game not in lobby status, current status: {$game['status']}\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Game is not in lobby state'
            ]));
            return;
        }

        $playerCount = count($game['players']);

        if ($playerCount < 5) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Need at least 5 players to start'
            ]));
            return;
        }

        // For test games, roles are already assigned
        if ($game['isTestGame'] ?? false) {
            $roles = $game['roles'];
            echo "Using existing test game roles\n";
        } else {
            // Assign roles for normal games
            $roles = $this->assignRoles($gameCode);
            $game['roles'] = $roles;
            echo "Assigned new roles: " . json_encode($roles) . "\n";
        }
        
        // Debug: List all players and their connections
        echo "Players in game:\n";
        foreach ($game['players'] as $rid => $p) {
            $hasConn = isset($p['connection']) ? 'YES' : 'NO';
            $name = $p['name'] ?? 'Unknown';
            echo "  - Player {$rid} ({$name}): connection={$hasConn}\n";
        }
        
        $game['status'] = 'playing';
        $game['round'] = 1;

        // Initialize case notes at game level (persists across phases)
        $game['caseNotes'] = [];

        // Initialize ready states
        $game['readyStates'] = [];
        foreach ($game['players'] as $resourceId => $player) {
            $game['readyStates'][$resourceId] = false;
        }

        // Get role descriptions
        $roleDescriptions = $this->getRoleDescriptions();

        echo "Sending roleAssigned to {$playerCount} players\n";

        // Send each player their role
        foreach ($game['players'] as $resourceId => $player) {
            $role = $roles[$resourceId] ?? null;
            
            if (!$role) {
                echo "WARNING: No role assigned for player {$resourceId}\n";
                continue;
            }
            
            // For Syndicate members, send list of other syndicate members
            $teammates = [];
            if ($role === 'Syndicate') {
                foreach ($roles as $rid => $r) {
                    if ($r === 'Syndicate' && $rid != $resourceId) {
                        $teammates[] = $game['players'][$rid]['name'] ?? 'Unknown';
                    }
                }
            }

            // Check connection exists
            if (!isset($player['connection'])) {
                echo "WARNING: No connection for player {$resourceId}\n";
                continue;
            }

            try {
                $player['connection']->send(json_encode([
                    'action' => 'roleAssigned',
                    'role' => $role,
                    'description' => $roleDescriptions[$role] ?? '',
                    'teammates' => $teammates,
                    'playerCount' => $playerCount,
                    'readyCount' => 0,
                    'totalPlayers' => $playerCount
                ]));
                echo "Sent roleAssigned to player {$resourceId} with role {$role}\n";
            } catch (\Exception $e) {
                echo "Error sending roleAssigned to player {$resourceId}: {$e->getMessage()}\n";
            }
        }

        echo "Game {$gameCode} started with {$playerCount} players\n";
    }

    private function handlePlayAgain(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);

        if (!$gameCode || !isset($this->games[$gameCode])) {
            return;
        }

        $game = &$this->games[$gameCode];

        echo "handlePlayAgain - playerId: {$playerId}, host: {$game['host']}\n";

        // Only host can restart the game (use loose comparison)
        if ($game['host'] != $playerId) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Only the host can restart the game'
            ]));
            return;
        }

        echo "Play Again requested by host for game {$gameCode}\n";

        // Reset all players to alive and not ready
        foreach ($game['players'] as $resourceId => &$player) {
            $player['alive'] = true;
            $player['ready'] = false;
        }
        unset($player);

        // Reset game state back to lobby - COMPLETE RESET
        $game['status'] = 'lobby';
        $game['round'] = 1;
        $game['isTestGame'] = false; // Reset test game flag
        unset($game['roles']);
        unset($game['readyStates']);

        // Clear all phase data
        unset($game['phase1']);
        unset($game['phase2']);
        unset($game['phase3']);
        unset($game['phase4']);
        unset($game['phase5']);
        unset($game['eliminationHistory']);
        unset($game['pendingVictimElimination']);
        unset($game['votingHistory']);
        unset($game['syndicateTargetHistory']);
        unset($game['usedKeywords']);
        unset($game['caseNotes']);
        unset($game['winner']);
        unset($game['gameOverReason']);

        echo "Game {$gameCode} fully reset. Status: {$game['status']}\n";

        // Build player list for lobby (use loose comparison)
        $playerList = [];
        foreach ($game['players'] as $resourceId => $player) {
            $playerList[] = [
                'id' => $resourceId,
                'name' => $player['name'],
                'isHost' => ($resourceId == $game['host'])
            ];
        }

        // Send all players back to lobby (use loose comparison)
        foreach ($game['players'] as $resourceId => $player) {
            if (($player['connected'] ?? true) && isset($player['connection'])) {
                try {
                    $player['connection']->send(json_encode([
                        'action' => 'playAgain',
                        'gameCode' => $gameCode,
                        'players' => $playerList,
                        'isHost' => ($resourceId == $game['host'])
                    ]));
                    echo "Sent playAgain (return to lobby) to player {$resourceId}\n";
                } catch (\Exception $e) {
                    echo "Error sending to player {$resourceId}: {$e->getMessage()}\n";
                }
            }
        }

        echo "Game {$gameCode} reset to lobby with " . count($game['players']) . " players\n";
    }

    private function handleLeaveGame(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);

        if (!$gameCode || !isset($this->games[$gameCode])) {
            return;
        }

        $game = &$this->games[$gameCode];

        // Only allow leaving from lobby
        if ($game['status'] !== 'lobby') {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Cannot leave game after it has started'
            ]));
            return;
        }

        $playerName = $game['players'][$playerId]['name'] ?? 'Unknown';
        $wasHost = ($game['host'] === $playerId);

        // Remove player from game
        unset($game['players'][$playerId]);
        unset($this->playerConnections[$conn->resourceId]);

        // If host left, transfer to next player
        if ($wasHost && count($game['players']) > 0) {
            $newHostId = array_key_first($game['players']);
            $game['host'] = $newHostId;
            $newHostName = $game['players'][$newHostId]['name'] ?? 'Unknown';
            echo "Host left. New host is {$newHostId} ({$newHostName})\n";
        }

        // Send confirmation to leaving player
        $conn->send(json_encode([
            'action' => 'leftGame',
            'message' => 'You have left the game'
        ]));

        // If no players left, remove the game
        if (count($game['players']) === 0) {
            unset($this->games[$gameCode]);
            echo "Game {$gameCode} removed - no players left\n";
            return;
        }

        // Broadcast updated player list to remaining players
        $this->broadcastToGame($gameCode, [
            'action' => 'playerListUpdate',
            'players' => $this->getPlayerList($gameCode),
            'message' => "{$playerName} has left the game" . ($wasHost ? ". New host assigned." : "")
        ]);

        echo "Player {$playerId} ({$playerName}) left game {$gameCode}\n";
    }

    private function handleRemovePlayer(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        $targetId = $data['targetId'] ?? null;

        echo "handleRemovePlayer - gameCode: {$gameCode}, playerId: {$playerId}, targetId: {$targetId}\n";

        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "handleRemovePlayer: Game not found\n";
            return;
        }

        $game = &$this->games[$gameCode];

        echo "handleRemovePlayer: game status = {$game['status']}, host = {$game['host']}\n";

        // Only host can remove players (use loose comparison)
        if ($game['host'] != $playerId) {
            echo "handleRemovePlayer: Not host\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Only the host can remove players'
            ]));
            return;
        }

        // Only allow in lobby
        if ($game['status'] !== 'lobby') {
            echo "handleRemovePlayer: Not in lobby, status = {$game['status']}\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Cannot remove players after game has started'
            ]));
            return;
        }

        // Can't remove yourself as host
        if ($targetId == $playerId) {
            echo "handleRemovePlayer: Cannot remove yourself\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Cannot remove yourself. Use "Leave Game" instead.'
            ]));
            return;
        }

        if (!$targetId || !isset($game['players'][$targetId])) {
            echo "handleRemovePlayer: Target player {$targetId} not found\n";
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Player not found'
            ]));
            return;
        }

        $targetName = $game['players'][$targetId]['name'] ?? 'Unknown';
        $targetConn = $game['players'][$targetId]['connection'] ?? null;

        echo "handleRemovePlayer: Removing player {$targetId} ({$targetName}) from game {$gameCode}\n";

        // Notify the removed player
        if ($targetConn) {
            try {
                $targetConn->send(json_encode([
                    'action' => 'removedFromGame',
                    'message' => 'You have been removed from the game by the host'
                ]));
                echo "handleRemovePlayer: Notified removed player\n";
            } catch (\Exception $e) {
                echo "handleRemovePlayer: Error notifying removed player: {$e->getMessage()}\n";
            }
        }

        // Remove player from game
        unset($game['players'][$targetId]);
        if (isset($this->playerConnections[$targetId])) {
            unset($this->playerConnections[$targetId]);
        }
        
        echo "handleRemovePlayer: Player removed. Remaining players: " . count($game['players']) . "\n";

        // Broadcast updated player list
        $this->broadcastToGame($gameCode, [
            'action' => 'playerListUpdate',
            'players' => $this->getPlayerList($gameCode),
            'message' => "{$targetName} has been removed from the game"
        ]);

        echo "Host removed player {$targetId} ({$targetName}) from game {$gameCode}\n";
    }

    private function getRoleDescriptions()
    {
        return [
            'Syndicate' => [
                'title' => 'Syndicate Member',
                'description' => 'You are part of the secret criminal organization. Your goal is to eliminate all innocent citizens without being discovered.',
                'abilities' => [
                    'Vote each night to eliminate one player',
                    'Know the identity of your fellow Syndicate members',
                    'Blend in during the day and mislead investigations'
                ],
                'winCondition' => 'Eliminate all non-Syndicate players or achieve equal numbers'
            ],
            'Detective' => [
                'title' => 'Detective',
                'description' => 'You are a skilled investigator working to expose the Syndicate. Use your abilities wisely to uncover the truth.',
                'abilities' => [
                    'Investigate one player each night to learn if they are Syndicate',
                    'Share your findings during day discussions',
                    'Lead the town to vote out Syndicate members'
                ],
                'winCondition' => 'Eliminate all Syndicate members'
            ],
            'Bystander' => [
                'title' => 'Innocent Bystander',
                'description' => 'You are an ordinary citizen caught in the crossfire. Stay vigilant and help identify the Syndicate through observation and deduction.',
                'abilities' => [
                    'Vote during the day to eliminate suspected Syndicate members',
                    'Observe player behavior and discussions',
                    'Form alliances with other players'
                ],
                'winCondition' => 'Survive and help eliminate all Syndicate members'
            ],
            'Eye Witness' => [
                'title' => 'Eye Witness',
                'description' => 'You witnessed a crime and caught a glimpse of the underworld. Once per game, you can identify a player\'s true allegiance.',
                'abilities' => [
                    'Use your one-time ability to reveal any player\'s role',
                    'Choose the perfect moment to use this powerful knowledge',
                    'Vote during the day like other citizens'
                ],
                'winCondition' => 'Survive and help eliminate all Syndicate members'
            ],
            'Body Guard' => [
                'title' => 'Body Guard',
                'description' => 'You are a professional protector. Each night, you can choose one player to shield from harm.',
                'abilities' => [
                    'Protect one player each night from elimination',
                    'Cannot protect yourself',
                    'Cannot protect the same player two nights in a row'
                ],
                'winCondition' => 'Survive and help eliminate all Syndicate members'
            ]
        ];
    }

    private function playerReady(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);

        echo "playerReady called - gameCode: {$gameCode}, playerId: {$playerId}\n";

        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "playerReady: Game not found\n";
            return;
        }

        $game = &$this->games[$gameCode];

        echo "playerReady: game status = {$game['status']}\n";

        if ($game['status'] !== 'playing') {
            echo "playerReady: Status is not 'playing', ignoring\n";
            return;
        }

        // Mark player as ready
        $game['readyStates'][$playerId] = true;
        $game['players'][$playerId]['ready'] = true;

        // Count ready players
        $readyCount = count(array_filter($game['readyStates']));
        $totalPlayers = count($game['players']);

        // Broadcast ready count to all players
        $this->broadcastToGame($gameCode, [
            'action' => 'readyUpdate',
            'readyCount' => $readyCount,
            'totalPlayers' => $totalPlayers
        ]);

        echo "Player ready in game {$gameCode}: {$readyCount}/{$totalPlayers}\n";

        // Check if all players are ready
        if ($readyCount === $totalPlayers) {
            echo "All players ready! Starting phase 1...\n";
            $this->startPhase($gameCode, 1);
        } else {
            echo "Waiting for more players: {$readyCount}/{$totalPlayers}\n";
        }
    }

    private function startPhase($gameCode, $phase)
    {
        $game = &$this->games[$gameCode];
        $game['phase'] = $phase;
        $game['status'] = 'phase' . $phase;

        echo "Game {$gameCode} starting phase {$phase}\n";

        // For test games, don't send phase messages - they'll be fetched via getTestPlayerState
        $isTestGame = $game['isTestGame'] ?? false;

        echo "startPhase: phase=$phase, isTestGame=" . ($isTestGame ? 'true' : 'false') . "\n";

        if ($phase === 1) {
            $this->initializePhase1($gameCode);
            
            echo "Phase 1: isTestGame=$isTestGame, sending messages: " . ($isTestGame ? 'NO' : 'YES') . "\n";
            
            // Only send phase start for non-test games
            if (!$isTestGame) {
                echo "Sending phase 1 start messages to players\n";
                // Send phase start with role-specific data to each player
                foreach ($game['players'] as $resourceId => $player) {
                    if (($player['connected'] ?? true) && isset($player['connection'])) {
                        $phaseState = $this->getPhase1StateForPlayer($gameCode, $resourceId);
                        $player['connection']->send(json_encode([
                            'action' => 'phaseStart',
                            'phase' => $phase,
                            'phaseName' => 'Deliberations',
                            'phaseState' => $phaseState
                        ]));
                    }
                }
            } else {
                echo "Skipping phase 1 start messages for test game\n";
            }
        } elseif ($phase === 2) {
            $this->initializePhase2($gameCode);
            
            // Only send phase start for non-test games
            if (!$isTestGame) {
                // Send phase start with host getting the murder story - ONLY TO ALIVE PLAYERS
                foreach ($game['players'] as $resourceId => $player) {
                    // Skip eliminated players - they should stay on elimination screen
                    if (!($player['alive'] ?? true)) {
                        echo "Skipping phase 2 for eliminated player $resourceId\n";
                        continue;
                    }
                    
                    if (($player['connected'] ?? true) && isset($player['connection'])) {
                        $isHost = $game['host'] === $resourceId;
                        $role = $game['roles'][$resourceId] ?? 'Bystander';
                        $isEyewitness = $role === 'Eye Witness';
                        $isDetective = $role === 'Detective';
                        $isAssassin = $resourceId === $game['phase2']['assassinId'];
                        
                        $messageData = [
                            'action' => 'phaseStart',
                            'phase' => $phase,
                            'phaseName' => 'The Murder',
                            'isHost' => $isHost,
                            'victimId' => $game['phase2']['victimId'],
                            'assassinId' => $game['phase2']['assassinId'],
                            'bodyGuardProtectionId' => $game['phase1']['bodyGuardProtection'] ?? null
                        ];
                        
                        if ($isHost) {
                            // Send murder story to host
                            $messageData['murderStory'] = $game['phase2']['murderStory'];
                        } else {
                            // Non-host sees waiting screen
                        }
                        
                        $player['connection']->send(json_encode($messageData));
                    }
                }
            }
        } elseif ($phase === 3) {
            $this->initializePhase3($gameCode);
            
            // Mark victim as dead BEFORE building player list (but after initializePhase3)
            // This way the alive player count will be correct
            $victimId = $game['phase2']['victimId'] ?? null;
            $victimConnection = null;
            $victimSaved = !($game['pendingVictimElimination'] ?? false) && $victimId !== null;
            
            if ($game['pendingVictimElimination'] ?? false) {
                $victimName = $game['players'][$victimId]['name'] ?? 'Unknown';
                $victimRole = $game['roles'][$victimId] ?? 'Unknown';
                
                // Store victim connection before marking dead
                $victimConnection = $game['players'][$victimId]['connection'] ?? null;
                
                $game['players'][$victimId]['alive'] = false;
                echo "Victim $victimId ($victimName) marked as dead before Phase 3 player list\n";
                
                // Store elimination data for later retrieval
                if (!isset($game['eliminationHistory'])) {
                    $game['eliminationHistory'] = [];
                }
                $game['eliminationHistory'][$victimId] = [
                    'playerId' => $victimId,
                    'playerName' => $victimName,
                    'role' => $victimRole,
                    'verdict' => 'ASSASSINATED'
                ];
                
                // Clear the pending flag
                $game['pendingVictimElimination'] = false;
                
                // Check win condition after assassination
                if ($this->checkGameEnd($gameCode)) {
                    return; // Game ended, don't continue to Phase 3
                }
            }
            
            // Build player list for alive players (victim is now marked dead so won't be included)
            $playerList = [];
            foreach ($game['players'] as $playerId => $player) {
                if ($player['alive'] ?? true) {
                    $playerList[] = [
                        'id' => $playerId,
                        'name' => $player['name'],
                        'alive' => true
                    ];
                }
            }
            
            // Send phase 3 start
            if (!$isTestGame) {
                // Send phase 3 start (Group Discussion) to alive players
                foreach ($game['players'] as $resourceId => $player) {
                    if (($player['connected'] ?? true) && isset($player['connection'])) {
                        if ($player['alive'] ?? true) {
                            $messageData = [
                                'action' => 'phase3Start',
                                'phase' => $phase,
                                'phaseName' => 'Group Discussion',
                                'players' => $playerList,
                                'doneCount' => 0,
                                'victimId' => $victimId,
                                'victimSaved' => $victimSaved,
                                'assassinId' => $game['phase2']['assassinId'] ?? null,
                                'verdict' => $victimSaved ? 'saved' : 'assassinated'
                            ];
                            
                            // Add special role messages
                            $role = $game['roles'][$resourceId] ?? null;
                            $keyword = $game['phase2']['keywordForRound'] ?? null;
                            
                            echo "Phase 3 - Player $resourceId has role: $role, keyword: $keyword\n";
                            
                            if ($role === 'Eye Witness' && $keyword && isset($game['phase2'])) {
                                $assassinId = $game['phase2']['assassinId'] ?? null;
                                if ($assassinId && $victimId) {
                                    $assassinName = $game['players'][$assassinId]['name'] ?? 'Unknown';
                                    $victimName = $game['players'][$victimId]['name'] ?? 'Unknown';
                                    
                                    $witnessMsg = $victimSaved 
                                        ? "You witnessed the assassination attempt!\nYou are the Eye Witness.\n\nYou know:\n- The would-be assassin was: $assassinName\n- The intended victim was: $victimName (saved!)\n\nUse your secret signal subtly during discussions to alert the detective.\n\nBe careful - the assassin may try to deceive others!"
                                        : "You witnessed the assassination!\nYou are the Eye Witness.\n\nYou know:\n- The assassin was: $assassinName\n- The victim was: $victimName\n\nUse your secret signal subtly during discussions to alert the detective.\n\nBe careful - the assassin may try to deceive others!";
                                    
                                    $messageData['eyewitnessData'] = [
                                        'keyword' => $keyword,
                                        'assassinName' => $assassinName,
                                        'victimName' => $victimName,
                                        'victimSaved' => $victimSaved,
                                        'warning' => $witnessMsg
                                    ];
                                    echo "Sending eyewitness message to player $resourceId\n";
                                }
                            }
                            
                            if ($role === 'Detective' && $keyword) {
                                $messageData['detectiveData'] = [
                                    'keyword' => $keyword,
                                    'hint' => "You are a Detective.\n\nListen carefully during discussions. The Eye Witness may reveal themselves subtly by using a secret signal:\n\nThe signal is: \"$keyword\"\n\nIf you hear this word or see a related gesture, you may have found the Eye Witness, who knows who the murderer is!\n\nUse this information wisely to expose the Syndicate."
                                ];
                                
                                // Add investigation results if detective investigated someone last round
                                $investigationTarget = $game['phase1']['detectiveActions'][$resourceId] ?? null;
                                if ($investigationTarget && isset($game['players'][$investigationTarget])) {
                                    $suspicionAnalysis = $this->calculateSuspicionLevel($gameCode, $investigationTarget);
                                    $messageData['detectiveData']['investigationResults'] = $suspicionAnalysis;
                                    echo "Sending investigation results to detective $resourceId for target $investigationTarget: {$suspicionAnalysis['level']}\n";
                                }
                                
                                echo "Sending detective message to player $resourceId\n";
                            }
                            
                            // Only show assassin warning if there's actually an Eye Witness in the game AND they are alive
                            $hasAliveEyeWitness = false;
                            foreach ($game['roles'] as $rid => $r) {
                                if ($r === 'Eye Witness' && ($game['players'][$rid]['alive'] ?? true)) {
                                    $hasAliveEyeWitness = true;
                                    break;
                                }
                            }
                            
                            // Only the actual assassin gets the witness warning
                            $assassinId = $game['phase2']['assassinId'] ?? null;
                            if ($resourceId === $assassinId && $keyword && isset($game['phase2']) && $hasAliveEyeWitness) {
                                $messageData['assassinData'] = [
                                    'warning' => "ALERT! You were witnessed committing the crime!\n\nSomeone saw you in the act. Watch carefully during discussions for who might be revealing your identity.\n\nBe very careful what you say - the Eye Witness could expose you."
                                ];
                                echo "Sending assassin warning to player $resourceId (the actual assassin)\n";
                            }
                            
                            $player['connection']->send(json_encode($messageData));
                        }
                    }
                }
                
                // Also send phase3Start to the victim so they see the elimination screen
                if ($victimId && $victimConnection) {
                    $victimMessage = [
                        'action' => 'phase3Start',
                        'phase' => $phase,
                        'phaseName' => 'Group Discussion',
                        'players' => $playerList,
                        'doneCount' => 0,
                        'victimId' => $victimId,
                        'assassinId' => $game['phase2']['assassinId'] ?? null,
                        'verdict' => 'assassinated'
                    ];
                    $victimConnection->send(json_encode($victimMessage));
                    echo "Sent phase3Start to victim $victimId for elimination screen\n";
                }
            } else {
                // For test games, send to connection
                $messageData = [
                    'action' => 'phase3Start',
                    'phase' => $phase,
                    'phaseName' => 'Group Discussion',
                    'players' => $playerList,
                    'doneCount' => 0,
                    'victimId' => $victimId,
                    'assassinId' => $game['phase2']['assassinId'] ?? null
                ];
                
                // For test games, we'll add the role-specific data for each player in getTestPlayerState
                $game['testConnection']->send(json_encode($messageData));
            }
        } elseif ($phase === 4) {
            $this->initializePhase4($gameCode);
            
            // Build player list for alive players only
            $playerList = [];
            foreach ($game['players'] as $playerId => $player) {
                if ($player['alive'] ?? true) {
                    $playerList[] = [
                        'id' => $playerId,
                        'name' => $player['name'],
                        'alive' => true
                    ];
                }
            }
            
            $alivePlayers = count($game['phase4']['alivePlayers']);
            
            // Send phase 4 start
            if (!$isTestGame) {
                foreach ($game['players'] as $resourceId => $player) {
                    if (($player['connected'] ?? true) && isset($player['connection'])) {
                        if ($player['alive'] ?? true) {
                            $player['connection']->send(json_encode([
                                'action' => 'phase4Start',
                                'phase' => $phase,
                                'phaseName' => 'The Vote',
                                'players' => $playerList,
                                'alivePlayers' => $alivePlayers,
                                'voteCount' => 0
                            ]));
                        }
                    }
                }
            } else {
                $game['testConnection']->send(json_encode([
                    'action' => 'phase4Start',
                    'phase' => $phase,
                    'phaseName' => 'The Vote',
                    'players' => $playerList,
                    'alivePlayers' => $alivePlayers,
                    'voteCount' => 0
                ]));
            }
        } elseif ($phase === 5) {
            $this->initializePhase5($gameCode);
            
            $accusedId = $game['phase5']['accusedId'];
            $accusedName = $game['phase5']['accusedName'];
            $totalPlayers = count($game['phase5']['alivePlayers']);
            
            // Send phase 5 start
            if (!$isTestGame) {
                foreach ($game['players'] as $resourceId => $player) {
                    if (($player['connected'] ?? true) && isset($player['connection'])) {
                        if ($player['alive'] ?? true) {
                            $player['connection']->send(json_encode([
                                'action' => 'phase5Start',
                                'phase' => $phase,
                                'phaseName' => 'The Trial',
                                'accusedId' => $accusedId,
                                'accusedName' => $accusedName,
                                'guiltyCount' => 0,
                                'notGuiltyCount' => 0,
                                'totalPlayers' => $totalPlayers
                            ]));
                        }
                    }
                }
            } else {
                $game['testConnection']->send(json_encode([
                    'action' => 'phase5Start',
                    'phase' => $phase,
                    'phaseName' => 'The Trial',
                    'accusedId' => $accusedId,
                    'accusedName' => $accusedName,
                    'guiltyCount' => 0,
                    'notGuiltyCount' => 0,
                    'totalPlayers' => $totalPlayers
                ]));
            }
        } else {
            $this->broadcastToGame($gameCode, [
                'action' => 'phaseStart',
                'phase' => $phase
            ]);
        }
    }

    private function assignRoles($gameCode)
    {
        $game = $this->games[$gameCode];
        $playerIds = array_keys($game['players']);
        $playerCount = count($playerIds);
        shuffle($playerIds);

        $roles = [];

        // Calculate role counts
        $syndicateCount = floor($playerCount / 3);
        $detectiveCount = floor($playerCount / 4);

        $roleIndex = 0;

        // Assign Syndicates
        for ($i = 0; $i < $syndicateCount; $i++) {
            $roles[$playerIds[$roleIndex++]] = 'Syndicate';
        }

        // Assign Detectives
        for ($i = 0; $i < $detectiveCount; $i++) {
            $roles[$playerIds[$roleIndex++]] = 'Detective';
        }

        // Assign optional roles
        if ($game['settings']['eyeWitness'] && $roleIndex < $playerCount) {
            $roles[$playerIds[$roleIndex++]] = 'Eye Witness';
        }

        if ($game['settings']['bodyGuard'] && $roleIndex < $playerCount) {
            $roles[$playerIds[$roleIndex++]] = 'Body Guard';
        }

        // Assign remaining as Bystanders
        while ($roleIndex < $playerCount) {
            $roles[$playerIds[$roleIndex++]] = 'Bystander';
        }

        return $roles;
    }

    private function getPlayerList($gameCode)
    {
        $players = [];
        foreach ($this->games[$gameCode]['players'] as $resourceId => $player) {
            $players[] = [
                'name' => $player['name'],
                'isHost' => $player['isHost'],
                'connected' => $player['connected'] ?? true
            ];
        }
        return $players;
    }

    private function broadcastToGame($gameCode, $data, $excludeResourceId = null)
    {
        $message = json_encode($data);
        $game = $this->games[$gameCode];
        
        // For test games, send once to the test connection
        if ($game['isTestGame'] ?? false) {
            if (isset($game['testConnection'])) {
                try {
                    $game['testConnection']->send($message);
                } catch (\Exception $e) {
                    echo "Error sending to test game connection: " . $e->getMessage() . "\n";
                }
            }
            return;
        }
        
        // For regular games, send to each player's connection
        foreach ($game['players'] as $resourceId => $player) {
            if ($resourceId !== $excludeResourceId && ($player['connected'] ?? true) && isset($player['connection'])) {
                try {
                    $player['connection']->send($message);
                } catch (\Exception $e) {
                    echo "Error sending to player $resourceId: " . $e->getMessage() . "\n";
                }
            }
        }
    }

    private function handlePlayerDisconnect(ConnectionInterface $conn)
    {
        $gameCode = $this->playerConnections[$conn->resourceId] ?? null;

        if (!$gameCode || !isset($this->games[$gameCode])) {
            return;
        }

        $game = &$this->games[$gameCode];
        $player = $game['players'][$conn->resourceId] ?? null;

        if (!$player) {
            return;
        }

        $playerName = $player['name'];
        $playerToken = $player['token'];
        $wasHost = $game['host'] === $conn->resourceId;

        // If game has started, keep player data for reconnection
        if ($game['status'] !== 'lobby') {
            // Mark player as disconnected but keep their data
            $game['players'][$conn->resourceId]['connected'] = false;
            $game['players'][$conn->resourceId]['connection'] = null;
            $game['players'][$conn->resourceId]['disconnectTime'] = time();

            echo "Player {$playerName} disconnected from game {$gameCode} (can reconnect)\n";

            // Broadcast disconnection to other players
            $this->broadcastToGame($gameCode, [
                'action' => 'playerDisconnected',
                'playerName' => $playerName,
                'players' => $this->getPlayerList($gameCode)
            ]);
        } else {
            // In lobby, remove player completely
            unset($game['players'][$conn->resourceId]);
            unset($this->playerTokens[$playerToken]);

            echo "Player {$playerName} left lobby {$gameCode}\n";

            // If no players left, delete the game
            if (empty($game['players'])) {
                unset($this->games[$gameCode]);
                echo "Game {$gameCode} deleted - no players remaining\n";
                unset($this->playerConnections[$conn->resourceId]);
                return;
            }

            // If host left in lobby, assign new host
            if ($wasHost) {
                $newHostId = array_key_first($game['players']);
                $game['host'] = $newHostId;
                $game['hostToken'] = $game['players'][$newHostId]['token'];
                $game['players'][$newHostId]['isHost'] = true;

                // Notify new host
                if ($game['players'][$newHostId]['connected'] ?? true) {
                    $game['players'][$newHostId]['connection']->send(json_encode([
                        'action' => 'becameHost'
                    ]));
                }
            }

            // Broadcast updated player list
            $this->broadcastToGame($gameCode, [
                'action' => 'playerListUpdate',
                'players' => $this->getPlayerList($gameCode)
            ]);
        }

        unset($this->playerConnections[$conn->resourceId]);
    }

    private function reconnectPlayer(ConnectionInterface $conn, $data)
    {
        $playerToken = $data['playerToken'] ?? '';

        if (empty($playerToken)) {
            $conn->send(json_encode([
                'action' => 'reconnectFailed',
                'message' => 'No session found'
            ]));
            return;
        }

        // Find the player by token
        $tokenData = $this->playerTokens[$playerToken] ?? null;

        if (!$tokenData) {
            $conn->send(json_encode([
                'action' => 'reconnectFailed',
                'message' => 'Session expired or invalid'
            ]));
            return;
        }

        $gameCode = $tokenData['gameCode'];
        $oldResourceId = $tokenData['resourceId'];

        if (!isset($this->games[$gameCode])) {
            unset($this->playerTokens[$playerToken]);
            $conn->send(json_encode([
                'action' => 'reconnectFailed',
                'message' => 'Game no longer exists'
            ]));
            return;
        }

        $game = &$this->games[$gameCode];
        $playerData = $game['players'][$oldResourceId] ?? null;

        if (!$playerData) {
            $conn->send(json_encode([
                'action' => 'reconnectFailed',
                'message' => 'Player not found in game'
            ]));
            return;
        }

        // Update player with new connection
        $game['players'][$conn->resourceId] = $playerData;
        $game['players'][$conn->resourceId]['connection'] = $conn;
        $game['players'][$conn->resourceId]['connected'] = true;
        unset($game['players'][$conn->resourceId]['disconnectTime']);

        // Clean up old resource ID if different
        if ($oldResourceId !== $conn->resourceId) {
            unset($game['players'][$oldResourceId]);
        }

        // Update host reference if this was the host
        if ($game['hostToken'] === $playerToken) {
            $game['host'] = $conn->resourceId;
        }

        // Update token mapping
        $this->playerTokens[$playerToken]['resourceId'] = $conn->resourceId;
        $this->playerConnections[$conn->resourceId] = $gameCode;

        $playerName = $playerData['name'];
        $isHost = $playerData['isHost'];

        echo "Player {$playerName} reconnected to game {$gameCode}\n";

        // Get role info if game has started
        $roleInfo = null;
        $teammates = [];
        $readyCount = 0;
        $totalPlayers = count($game['players']);

        if (isset($game['roles'][$oldResourceId])) {
            // Move role to new resource ID
            $game['roles'][$conn->resourceId] = $game['roles'][$oldResourceId];
            if ($oldResourceId !== $conn->resourceId) {
                unset($game['roles'][$oldResourceId]);
            }

            $role = $game['roles'][$conn->resourceId];
            $roleDescriptions = $this->getRoleDescriptions();
            $roleInfo = [
                'role' => $role,
                'description' => $roleDescriptions[$role]
            ];

            // Get teammates for Syndicate
            if ($role === 'Syndicate') {
                foreach ($game['roles'] as $rid => $r) {
                    if ($r === 'Syndicate' && $rid !== $conn->resourceId) {
                        $teammates[] = $game['players'][$rid]['name'];
                    }
                }
            }
        }

        // Update ready states if they exist
        if (isset($game['readyStates'][$oldResourceId])) {
            $game['readyStates'][$conn->resourceId] = $game['readyStates'][$oldResourceId];
            if ($oldResourceId !== $conn->resourceId) {
                unset($game['readyStates'][$oldResourceId]);
            }
            $readyCount = count(array_filter($game['readyStates']));
        }

        // Send reconnection data
        $reconnectData = [
            'action' => 'reconnected',
            'gameCode' => $gameCode,
            'playerName' => $playerName,
            'isHost' => $isHost,
            'players' => $this->getPlayerList($gameCode),
            'gameStatus' => $game['status'],
            'phase' => $game['phase'] ?? null
        ];

        if ($roleInfo) {
            $reconnectData['role'] = $roleInfo['role'];
            $reconnectData['roleDescription'] = $roleInfo['description'];
            $reconnectData['teammates'] = $teammates;
            $reconnectData['readyCount'] = $readyCount;
            $reconnectData['totalPlayers'] = $totalPlayers;
            $reconnectData['isReady'] = $game['readyStates'][$conn->resourceId] ?? false;
        }

        $conn->send(json_encode($reconnectData));

        // Notify other players of reconnection
        $this->broadcastToGame($gameCode, [
            'action' => 'playerReconnected',
            'playerName' => $playerName,
            'players' => $this->getPlayerList($gameCode)
        ], $conn->resourceId);
    }

    // ==================== PHASE 1: DELIBERATIONS ====================

    private function initializePhase1($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        $game['phase1'] = [
            'syndicateVoting' => [
                'stage' => 'target', // 'target' or 'assassin'
                'recommendations' => [], // resourceId => targetResourceId
                'lockedIn' => [], // resourceId => true
                'tieRetry' => false,
                'target' => null,
                'assassin' => null
            ],
            'detectiveActions' => [], // resourceId => targetResourceId
            'detectiveLockedIn' => [],
            'bystanderVotes' => [], // resourceId => targetResourceId
            'bodyGuardProtection' => null, // resourceId of protected player
            'gameNotes' => [], // Messages visible to all
            'playersDone' => [] // Track which players have clicked "I'm Done"
        ];

        // Get player lists by role for easier access (only alive players)
        $syndicates = [];
        $detectives = [];
        $bystanders = []; // Includes Eye Witness and Body Guard for voting
        $bodyGuard = null;

        foreach ($game['roles'] as $resourceId => $role) {
            // Skip dead players
            if (!($game['players'][$resourceId]['alive'] ?? true)) {
                continue;
            }
            
            switch ($role) {
                case 'Syndicate':
                    $syndicates[] = $resourceId;
                    break;
                case 'Detective':
                    $detectives[] = $resourceId;
                    break;
                case 'Body Guard':
                    $bodyGuard = $resourceId;
                    $bystanders[] = $resourceId;
                    break;
                default:
                    $bystanders[] = $resourceId;
                    break;
            }
        }

        $game['phase1']['syndicates'] = $syndicates;
        $game['phase1']['detectives'] = $detectives;
        $game['phase1']['bystanders'] = $bystanders;
        $game['phase1']['bodyGuard'] = $bodyGuard;
        
        // In Round 1, detectives can't investigate - auto-mark them as locked in
        $round = $game['round'] ?? 1;
        if ($round === 1) {
            foreach ($detectives as $detectiveId) {
                $game['phase1']['detectiveLockedIn'][$detectiveId] = true;
            }
            echo "Round 1: Auto-locked " . count($detectives) . " detective(s) (no investigation in Round 1)\n";
        }
    }

    private function getEyewitnesses($gameCode)
    {
        $game = $this->games[$gameCode];
        $eyewitnesses = [];
        
        // Find all players with the "Eye Witness" role
        foreach ($game['roles'] as $playerId => $role) {
            if ($role === 'Eye Witness') {
                $eyewitnesses[] = $playerId;
            }
        }
        
        return $eyewitnesses;
    }

    private function initializePhase2($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Get the victim (target from phase 1)
        $victimId = $game['phase1']['syndicateVoting']['target'];
        $assassinId = $game['phase1']['syndicateVoting']['assassin'];
        
        echo "initializePhase2: victimId=$victimId, assassinId=$assassinId\n";
        
        // Handle case where there are no syndicates (e.g., all bystanders in test game)
        if ($victimId === null || $assassinId === null) {
            // No murder - all bystanders
            $murderStory = "No murder occurred this night. Everyone survived. The night passed peacefully.";
            $game['phase2'] = [
                'murderStory' => $murderStory,
                'victimId' => null,
                'assassinId' => null,
                'eyewitnesses' => []
            ];
            echo "No murder scenario, story set: $murderStory\n";
            return;
        }
        
        // Get eyewitnesses (randomly selected from bystanders)
        $eyewitnesses = $this->getEyewitnesses($gameCode);
        
        // Select a random keyword for this round (not used before in this game)
        $usedKeywords = $game['usedKeywords'] ?? [];
        $availableKeywords = array_diff($this->availableKeywords, $usedKeywords);
        if (empty($availableKeywords)) {
            $availableKeywords = $this->availableKeywords; // Reset if all used
        }
        $roundKeyword = $availableKeywords[array_rand($availableKeywords)];
        if (!isset($game['usedKeywords'])) {
            $game['usedKeywords'] = [];
        }
        $game['usedKeywords'][] = $roundKeyword;
        
        echo "Selected keyword for this round: $roundKeyword\n";
        
        // Generate murder story
        $murderStory = $this->generateMurderStory($gameCode, $victimId, $assassinId, $eyewitnesses);
        
        echo "Murder story generated: $murderStory\n";
        
        $game['phase2'] = [
            'murderStory' => $murderStory,
            'victimId' => $victimId,
            'assassinId' => $assassinId,
            'eyewitnesses' => $eyewitnesses,
            'keywordForRound' => $roundKeyword
        ];
        
        // Track syndicate target history for detective investigation
        if (!isset($game['syndicateTargetHistory'])) {
            $game['syndicateTargetHistory'] = [];
        }
        if ($victimId) {
            $game['syndicateTargetHistory'][] = $victimId;
        }
    }


    private function handlePlayerDone(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        echo "handlePlayerDone - gameCode: {$gameCode}, playerId: {$playerId}\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "Game not found!\n";
            return;
        }

        $game = &$this->games[$gameCode];
        if (!isset($game['phase1'])) {
            echo "Phase1 not initialized!\n";
            return;
        }

        $game['phase1']['playersDone'][$playerId] = true;
        $doneCount = count($game['phase1']['playersDone']);
        
        // Count only alive players for total
        $totalCount = 0;
        foreach ($game['players'] as $p) {
            if ($p['alive'] ?? true) {
                $totalCount++;
            }
        }

        echo "Player {$playerId} marked done: {$doneCount}/{$totalCount}\n";

        // Broadcast update to all players
        $message = [
            'action' => 'playerDoneUpdate',
            'doneCount' => $doneCount,
            'totalPlayers' => $totalCount
        ];
        echo "Broadcasting playerDoneUpdate: " . json_encode($message) . "\n";
        $this->broadcastToGame($gameCode, $message);

        $this->checkPhase1Complete($gameCode);
    }

    private function handlePlayerReadyPhase2(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        echo "handlePlayerReadyPhase2 - gameCode: {$gameCode}, playerId: {$playerId}\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "Game not found!\n";
            return;
        }

        $game = &$this->games[$gameCode];
        if (!isset($game['phase2'])) {
            echo "Phase2 not initialized!\n";
            return;
        }

        // Initialize playersReady tracking if not already done
        if (!isset($game['phase2']['playersReady'])) {
            $game['phase2']['playersReady'] = [];
        }

        $game['phase2']['playersReady'][$playerId] = true;
        $readyCount = count($game['phase2']['playersReady']);
        
        // Count only alive players for total
        $totalCount = 0;
        foreach ($game['players'] as $p) {
            if ($p['alive'] ?? true) {
                $totalCount++;
            }
        }

        echo "Player {$playerId} marked ready for Phase 2: {$readyCount}/{$totalCount}\n";

        // Broadcast update to all players
        $message = [
            'action' => 'playerReadyUpdate',
            'readyCount' => $readyCount,
            'totalPlayers' => $totalCount
        ];
        echo "Broadcasting playerReadyUpdate: " . json_encode($message) . "\n";
        $this->broadcastToGame($gameCode, $message);

        $this->checkPhase2Complete($gameCode);
    }

    private function generateMurderStory($gameCode, $victimId, $assassinId, $eyewitnesses)
    {
        $game = &$this->games[$gameCode];
        $victim = $game['players'][$victimId]['name'];
        $assassin = $game['players'][$assassinId]['name'];
        
        // Check if body guard protected the target
        $phase1 = &$game['phase1'];
        $bodyGuardProtectedTarget = isset($phase1['bodyGuardProtection']) && $phase1['bodyGuardProtection'] === $victimId;
        
        // Check if there's an eyewitness in the game
        $hasEyewitness = false;
        foreach ($game['roles'] as $role) {
            if ($role === 'Eye Witness') {
                $hasEyewitness = true;
                break;
            }
        }
        
        if ($bodyGuardProtectedTarget) {
            // Target was protected - they survived
            $savedStories = [
                "{$victim} was walking home late when an attack occurred. A mysterious savior intervened, and {$victim} was spared from a terrible fate." . ($hasEyewitness ? " Someone in the shadows witnessed the encounter." : ""),
                "Danger struck {$victim} in a dark alley, but an unknown guardian appeared and prevented the worst. {$victim} lives to see another day." . ($hasEyewitness ? " Rumors of a witness circulate among the crowd." : ""),
                "{$victim}'s apartment was targeted in the dead of night. An unseen protector foiled the plot. {$victim} remains alive, shaken but safe." . ($hasEyewitness ? " There are whispers of someone who saw what happened." : ""),
                "An assassination attempt was made on {$victim} at the corner store, but an anonymous hero intervened. {$victim} narrowly escaped." . ($hasEyewitness ? " A bystander may have seen the whole thing." : ""),
                "{$victim} was cornered in the parking garage by an assailant, but a courageous stranger stepped in. The attack was thwarted." . ($hasEyewitness ? " Someone might be able to confirm what really happened." : "")
            ];
            return $savedStories[array_rand($savedStories)];
        }
        
        // Target was killed
        $stories = [
            "{$victim} was found dead in their apartment this morning. The door was forced open. Investigation reveals signs of a violent struggle." . ($hasEyewitness ? " Someone in the building may have heard something." : ""),
            "A body has been discovered in the city park. {$victim} will never enjoy another sunrise. The manner of death is unmistakably foul play." . ($hasEyewitness ? " A jogger might have been nearby earlier." : ""),
            "{$victim} was found lifeless in the building's basement. No witnesses stepped forward, though residents report hearing sounds late last night." . ($hasEyewitness ? " But perhaps one person did see something." : ""),
            "The hotel hallway became a crime scene when {$victim} was found dead outside their room. How did this happen without anyone noticing?" . ($hasEyewitness ? " Unless someone was watching..." : ""),
            "{$victim}'s body was discovered in the office building after hours. Security footage has mysteriously gone missing." . ($hasEyewitness ? " One employee may have been working late and seen the truth." : ""),
            "Police found {$victim} dead in the warehouse district. The crime was clean and professional. Questions linger about who could have orchestrated this." . ($hasEyewitness ? " A worker in the area might hold the key." : ""),
            "{$victim} was found in the museum, sprawled on the marble floor. The artifacts were untouched. This was not a robbery—it was an execution." . ($hasEyewitness ? " A night guard could have been nearby." : ""),
            "The penthouse has become a murder scene. {$victim} lies cold on the floor of their luxurious home. No signs of forced entry, but the killer is long gone." . ($hasEyewitness ? " Someone in the building might remember seeing an unexpected visitor." : ""),
            "{$victim} never made it home from the bus station. Their body was found hours later in an abandoned lot. The city has turned dangerous." . ($hasEyewitness ? " A late-night commuter may have seen the killer." : ""),
            "The restaurant's back alley became a tomb when {$victim} was discovered. An employee taking out trash made the horrifying discovery." . ($hasEyewitness ? " Another staff member might have seen something from a window." : ""),
            "{$victim} was found dead in the hospital's stairwell. How such a thing could happen in a place of healing is a mystery." . ($hasEyewitness ? " A nurse or visitor could have knowledge about the incident." : ""),
            "The bookstore owner discovered {$victim}'s body in the storage room this morning. A shocking crime in an unexpected place." . ($hasEyewitness ? " Perhaps a customer who stayed too late saw something." : ""),
            "{$victim} was found dead at the train station. The killer vanished among the crowds. This murder won't be easily solved." . ($hasEyewitness ? " A commuter might have noticed the perpetrator." : ""),
            "A housekeeper made a grim discovery: {$victim}, dead in the grand lobby of the hotel. The staff is in shock." . ($hasEyewitness ? " A guest checking out early might have witnessed the crime." : ""),
            "{$victim}'s body was found in the university library after closing. Campus police have sealed off the area. A student killer walks among you." . ($hasEyewitness ? " Someone shelving books nearby may know what happened." : ""),
            "The shopping mall's rooftop parking garage holds a dark secret today. {$victim} was found here, lifeless. How many people drive past a crime scene without knowing?" . ($hasEyewitness ? " A shopper leaving late might have seen the killer." : ""),
            "{$victim} was discovered dead in the subway tunnel. The tracks tell no tales, but someone out there knows the truth." . ($hasEyewitness ? " A transit worker or late passenger could have information." : ""),
            "The luxury penthouse has become a crime scene. {$victim} lies dead, surrounded by elegance that now feels sinister." . ($hasEyewitness ? " The doorman or a neighbor might have seen something." : ""),
            "A gruesome discovery was made in the downtown alley behind the restaurant district. {$victim} is gone, cut down in a moment of violence." . ($hasEyewitness ? " Someone from a nearby business could have witnessed it." : ""),
            "{$victim} won't be walking these city streets anymore. Found dead in circumstances that suggest premeditation. Someone executed this perfectly." . ($hasEyewitness ? " A vigilant observer might hold the key to justice." : "")
        ];
        
        return $stories[array_rand($stories)];
    }

    private function getEyewitnessLine($game, $eyewitnesses)
    {
        // Eyewitnesses are NEVER revealed in the murder story
        // They must choose to reveal themselves
        return "";
    }

    private function handleSyndicateRecommend(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Syndicate') return;
        if (!isset($game['phase1'])) return;

        $targetId = $data['targetId'] ?? null;
        if (!$targetId || !isset($game['players'][$targetId])) return;

        $stage = $game['phase1']['syndicateVoting']['stage'];

        // Can't change recommendation after locking in
        if (isset($game['phase1']['syndicateVoting']['lockedIn'][$playerId])) {
            return;
        }

        // For assassin voting, target must be a syndicate
        if ($stage === 'assassin' && $game['roles'][$targetId] !== 'Syndicate') {
            return;
        }

        // For target voting, can't target other syndicates
        if ($stage === 'target' && $game['roles'][$targetId] === 'Syndicate') {
            return;
        }

        $game['phase1']['syndicateVoting']['recommendations'][$playerId] = $targetId;

        // Broadcast updated recommendations to all syndicates
        $this->broadcastToSyndicates($gameCode, [
            'action' => 'syndicateRecommendationsUpdate',
            'recommendations' => $this->getSyndicateRecommendations($gameCode),
            'stage' => $stage
        ]);
    }

    private function handleSyndicateLockIn(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Syndicate') return;
        if (!isset($game['phase1'])) return;

        // Must have a recommendation to lock in
        if (!isset($game['phase1']['syndicateVoting']['recommendations'][$playerId])) {
            echo "Syndicate lock-in failed: no recommendation for {$playerId}\n";
            return;
        }

        // Check if already locked in
        if (isset($game['phase1']['syndicateVoting']['lockedIn'][$playerId])) {
            echo "Syndicate {$playerId} already locked in\n";
            return;
        }

        $game['phase1']['syndicateVoting']['lockedIn'][$playerId] = true;

        $syndicates = $game['phase1']['syndicates'];
        $lockedInCount = count($game['phase1']['syndicateVoting']['lockedIn']);

        echo "Syndicate {$playerId} locked in: {$lockedInCount}/" . count($syndicates) . "\n";

        // Notify syndicates of lock-in progress
        $this->broadcastToSyndicates($gameCode, [
            'action' => 'syndicateLockInUpdate',
            'lockedIn' => array_keys($game['phase1']['syndicateVoting']['lockedIn']),
            'lockedInCount' => $lockedInCount,
            'totalSyndicates' => count($syndicates)
        ]);

        // Check if all syndicates have locked in
        if ($lockedInCount === count($syndicates)) {
            echo "All syndicates locked in, resolving voting\n";
            $this->resolveSyndicateVoting($gameCode);
        }
    }

    private function resolveSyndicateVoting($gameCode)
    {
        $game = &$this->games[$gameCode];
        $stage = $game['phase1']['syndicateVoting']['stage'];
        $recommendations = $game['phase1']['syndicateVoting']['recommendations'];

        // Count votes
        $voteCounts = [];
        foreach ($recommendations as $voterId => $targetId) {
            if (!isset($voteCounts[$targetId])) {
                $voteCounts[$targetId] = 0;
            }
            $voteCounts[$targetId]++;
        }

        // Find the max vote count and check for ties
        $maxVotes = max($voteCounts);
        $winners = array_keys(array_filter($voteCounts, fn($v) => $v === $maxVotes));

        if (count($winners) > 1) {
            // It's a tie
            if (!$game['phase1']['syndicateVoting']['tieRetry']) {
                // First tie - retry once
                $game['phase1']['syndicateVoting']['tieRetry'] = true;
                $game['phase1']['syndicateVoting']['recommendations'] = [];
                $game['phase1']['syndicateVoting']['lockedIn'] = [];

                $this->broadcastToSyndicates($gameCode, [
                    'action' => 'syndicateTie',
                    'message' => 'Vote ended in a tie! Vote again.',
                    'stage' => $stage
                ]);
            } else {
                // Second tie
                if ($stage === 'target') {
                    // No target this round
                    $game['phase1']['syndicateVoting']['target'] = null;
                    $this->broadcastToSyndicates($gameCode, [
                        'action' => 'syndicateTargetFailed',
                        'message' => 'Second tie! The Syndicate fails to choose a target this round.'
                    ]);
                    // Skip assassin voting, move to next check
                    $this->checkPhase1Complete($gameCode);
                } else {
                    // Assassin tie - pick randomly
                    $game['phase1']['syndicateVoting']['assassin'] = $winners[array_rand($winners)];
                    $assassinName = $game['players'][$game['phase1']['syndicateVoting']['assassin']]['name'];
                    $this->broadcastToSyndicates($gameCode, [
                        'action' => 'syndicateAssassinChosen',
                        'assassinId' => $game['phase1']['syndicateVoting']['assassin'],
                        'assassinName' => $assassinName,
                        'message' => "Tie! {$assassinName} was randomly selected as the assassin."
                    ]);
                    $this->checkPhase1Complete($gameCode);
                }
            }
        } else {
            // Clear winner
            $winnerId = $winners[0];

            if ($stage === 'target') {
                $game['phase1']['syndicateVoting']['target'] = $winnerId;
                $targetName = $game['players'][$winnerId]['name'];
                
                // Move to assassin voting
                $game['phase1']['syndicateVoting']['stage'] = 'assassin';
                $game['phase1']['syndicateVoting']['recommendations'] = [];
                $game['phase1']['syndicateVoting']['lockedIn'] = [];
                $game['phase1']['syndicateVoting']['tieRetry'] = false;

                // Check if there's only 1 syndicate - if so, auto-lock them as assassin
                $syndicates = $game['phase1']['syndicates'];
                if (count($syndicates) === 1) {
                    $onlySyndicate = $syndicates[0];
                    $game['phase1']['syndicateVoting']['assassin'] = $onlySyndicate;
                    $game['phase1']['syndicateVoting']['lockedIn'][$onlySyndicate] = true;
                    $assassinName = $game['players'][$onlySyndicate]['name'];
                    
                    $this->broadcastToSyndicates($gameCode, [
                        'action' => 'syndicateAssassinChosen',
                        'assassinId' => $onlySyndicate,
                        'assassinName' => $assassinName,
                        'message' => "Only one Syndicate member! {$assassinName} is automatically the assassin."
                    ]);
                    
                    // Check if phase is complete now that assassin is set
                    $this->checkPhase1Complete($gameCode);
                } else {
                    $this->broadcastToSyndicates($gameCode, [
                        'action' => 'syndicateTargetChosen',
                        'targetId' => $winnerId,
                        'targetName' => $targetName,
                        'message' => "{$targetName} has been chosen as the target. Now choose who will be the assassin."
                    ]);
                }
            } else {
                // Assassin chosen
                $game['phase1']['syndicateVoting']['assassin'] = $winnerId;
                $assassinName = $game['players'][$winnerId]['name'];
                $this->broadcastToSyndicates($gameCode, [
                    'action' => 'syndicateAssassinChosen',
                    'assassinId' => $winnerId,
                    'assassinName' => $assassinName,
                    'message' => "{$assassinName} has been chosen as the assassin."
                ]);
                $this->checkPhase1Complete($gameCode);
            }
        }
    }

    private function handleDetectiveInvestigate(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Detective') return;
        if (!isset($game['phase1'])) return;

        // Can't investigate in Round 1
        $round = $game['round'] ?? 1;
        if ($round < 2) {
            $conn->send(json_encode([
                'action' => 'error',
                'message' => 'Investigation is not available in Round 1. You can investigate from Round 2 onwards.'
            ]));
            return;
        }

        // Can't change after locking in
        if (isset($game['phase1']['detectiveLockedIn'][$playerId])) {
            return;
        }

        $targetId = $data['targetId'] ?? null;
        if (!$targetId || !isset($game['players'][$targetId])) return;

        // Can't investigate yourself
        if ($targetId === $playerId) return;

        $game['phase1']['detectiveActions'][$playerId] = $targetId;

        $conn->send(json_encode([
            'action' => 'detectiveSelectionUpdate',
            'targetId' => $targetId,
            'targetName' => $game['players'][$targetId]['name']
        ]));
    }

    private function handleDetectiveLockIn(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Detective') return;
        if (!isset($game['phase1'])) return;

        // Must have selected someone
        if (!isset($game['phase1']['detectiveActions'][$playerId])) {
            return;
        }

        $game['phase1']['detectiveLockedIn'][$playerId] = true;
        $targetId = $game['phase1']['detectiveActions'][$playerId];

        $conn->send(json_encode([
            'action' => 'detectiveLockedIn',
            'targetId' => $targetId,
            'targetName' => $game['players'][$targetId]['name'],
            'message' => 'Investigation target locked in. Suspicion analysis will be revealed at the start of the discussion phase.'
        ]));

        $this->checkPhase1Complete($gameCode);
    }

    /**
     * Calculate suspicion level for a player based on their voting history
     * Returns: ['level' => 'Low'|'Medium'|'High'|'Unknown', 'reasons' => [...], 'details' => '...']
     */
    private function calculateSuspicionLevel($gameCode, $targetId)
    {
        $game = &$this->games[$gameCode];
        $round = $game['round'] ?? 1;
        $targetRole = $game['roles'][$targetId] ?? 'Unknown';
        $targetName = $game['players'][$targetId]['name'] ?? 'Unknown';
        
        // Round 1 - no voting history yet
        if ($round <= 1) {
            return [
                'level' => 'Unknown',
                'targetName' => $targetName,
                'reasons' => [],
                'details' => "No voting history available yet. This is the first round - observe {$targetName}'s behavior during discussions and voting."
            ];
        }
        
        // Get voting history
        $votingHistory = $game['votingHistory'] ?? [];
        $eliminationHistory = $game['eliminationHistory'] ?? [];
        
        $suspicionScore = 0;
        $reasons = [];
        
        // Analyze voting patterns
        foreach ($votingHistory as $roundNum => $roundVotes) {
            if (isset($roundVotes[$targetId])) {
                $votedForId = $roundVotes[$targetId];
                $votedForRole = $game['roles'][$votedForId] ?? null;
                $votedForName = $game['players'][$votedForId]['name'] ?? 'Unknown';
                
                // Check if they voted for an innocent who was eliminated
                if (isset($eliminationHistory[$votedForId])) {
                    $elimination = $eliminationHistory[$votedForId];
                    if ($elimination['verdict'] === 'GUILTY' && $votedForRole !== 'Syndicate') {
                        $suspicionScore -= 1; // Voted to eliminate an innocent - slightly suspicious
                        $reasons[] = "Voted to eliminate {$votedForName} (was innocent)";
                    } elseif ($elimination['verdict'] === 'GUILTY' && $votedForRole === 'Syndicate') {
                        $suspicionScore += 2; // Helped eliminate a Syndicate - good sign
                        $reasons[] = "Helped eliminate {$votedForName} (was Syndicate)";
                    }
                }
                
                // Check if they consistently vote against confirmed innocents
                if ($votedForRole !== 'Syndicate' && $votedForRole !== null) {
                    $suspicionScore -= 0.5;
                }
            }
        }
        
        // Check if they were ever targeted by Syndicate (Syndicate doesn't target their own)
        $syndicateTargets = $game['syndicateTargetHistory'] ?? [];
        if (in_array($targetId, $syndicateTargets)) {
            $suspicionScore += 3; // Being targeted by Syndicate is a strong indicator of innocence
            $reasons[] = "Was previously targeted by the Syndicate";
        }
        
        // Determine suspicion level
        if ($suspicionScore >= 2) {
            $level = 'Low';
            $details = "{$targetName} appears to be acting in the town's interest. Their voting patterns suggest they are likely innocent.";
        } elseif ($suspicionScore >= 0) {
            $level = 'Medium';
            $details = "{$targetName}'s behavior is inconclusive. They haven't done anything overtly suspicious, but also haven't proven themselves trustworthy.";
        } else {
            $level = 'High';
            $details = "{$targetName} has exhibited suspicious behavior. Their voting patterns suggest they may be working against the town's interests.";
        }
        
        // Add a hint based on actual role (but not reveal it directly)
        if ($targetRole === 'Syndicate') {
            // Syndicate members might have subtle tells
            if ($level !== 'High' && $round > 2) {
                $level = 'Medium'; // Bump up slightly over time
                $reasons[] = "Something feels off about their behavior";
            }
        }
        
        return [
            'level' => $level,
            'targetName' => $targetName,
            'reasons' => $reasons,
            'details' => $details
        ];
    }

    private function handleUpdateCaseNotes(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Detective') return;

        $targetId = $data['targetId'] ?? null;
        $notes = $data['notes'] ?? [];

        if (!$targetId || !isset($game['players'][$targetId])) return;

        // Validate notes are valid role names
        $validRoles = ['Syndicate', 'Detective', 'Bystander', 'Eye Witness', 'Body Guard', 'Innocent', 'Suspicious'];
        $notes = array_filter($notes, fn($n) => in_array($n, $validRoles));

        // Store at game level so notes persist across phases
        if (!isset($game['caseNotes'][$playerId])) {
            $game['caseNotes'][$playerId] = [];
        }

        $game['caseNotes'][$playerId][$targetId] = $notes;

        $conn->send(json_encode([
            'action' => 'caseNotesUpdated',
            'targetId' => $targetId,
            'notes' => $notes
        ]));
    }

    private function handleBystanderSelect(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        // Syndicates and Detectives don't participate in bystander voting
        if ($role === 'Syndicate' || $role === 'Detective') return;
        if (!isset($game['phase1'])) return;

        $targetId = $data['targetId'] ?? null;
        if (!$targetId || !isset($game['players'][$targetId])) return;

        // Can't select yourself
        if ($targetId === $playerId) return;

        $game['phase1']['bystanderVotes'][$playerId] = $targetId;

        $conn->send(json_encode([
            'action' => 'bystanderSelectionConfirmed',
            'targetId' => $targetId,
            'targetName' => $game['players'][$targetId]['name']
        ]));

        $this->checkBystanderMajority($gameCode);
        $this->checkPhase1Complete($gameCode);
    }

    private function handleBodyGuardProtect(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $role = $game['roles'][$playerId] ?? null;

        if ($role !== 'Body Guard') return;
        if (!isset($game['phase1'])) return;

        $targetId = $data['targetId'] ?? null;
        if (!$targetId || !isset($game['players'][$targetId])) return;

        // Can't protect yourself
        if ($targetId === $playerId) return;

        $game['phase1']['bodyGuardProtection'] = $targetId;

        $conn->send(json_encode([
            'action' => 'bodyGuardProtectionSet',
            'targetId' => $targetId,
            'targetName' => $game['players'][$targetId]['name'],
            'message' => "You are protecting {$game['players'][$targetId]['name']} tonight."
        ]));

        $this->checkPhase1Complete($gameCode);
    }


    private function checkBystanderMajority($gameCode)
    {
        $game = &$this->games[$gameCode];
        $bystanders = $game['phase1']['bystanders'];
        $votes = $game['phase1']['bystanderVotes'];

        // Count votes for each target
        $voteCounts = [];
        foreach ($votes as $voterId => $targetId) {
            if (!isset($voteCounts[$targetId])) {
                $voteCounts[$targetId] = 0;
            }
            $voteCounts[$targetId]++;
        }

        // Check if majority voted for a syndicate
        $majorityThreshold = ceil(count($bystanders) / 2);

        foreach ($voteCounts as $targetId => $count) {
            if ($count >= $majorityThreshold) {
                $targetRole = $game['roles'][$targetId];
                if ($targetRole === 'Syndicate') {
                    // Add rumor to game notes (but don't reveal who)
                    if (!in_array('A rumor has surfaced...', $game['phase1']['gameNotes'])) {
                        $game['phase1']['gameNotes'][] = 'A rumor has surfaced...';
                        
                        // Broadcast to all players
                        $this->broadcastToGame($gameCode, [
                            'action' => 'gameNoteAdded',
                            'note' => 'A rumor has surfaced...'
                        ]);
                    }
                    break;
                }
            }
        }
    }

    private function checkPhase1Complete($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Check syndicates completion
        $syndicatesDone = false;
        $syndicates = $game['phase1']['syndicates'];
        $stage = $game['phase1']['syndicateVoting']['stage'];
        $target = $game['phase1']['syndicateVoting']['target'] ?? null;
        $assassin = $game['phase1']['syndicateVoting']['assassin'] ?? null;
        $tieRetry = $game['phase1']['syndicateVoting']['tieRetry'] ?? false;
        
        echo "Syndicate voting state - Stage: $stage, Target: " . ($target ?? 'null') . ", Assassin: " . ($assassin ?? 'null') . ", TieRetry: " . ($tieRetry ? 'true' : 'false') . "\n";
        
        if ($stage === 'target') {
            // Still in target voting - not done
            $syndicatesDone = false;
        } elseif ($stage === 'assassin') {
            // In assassin voting - done when assassin is chosen
            if ($assassin !== null) {
                $syndicatesDone = true;
            } elseif ($target === null && $tieRetry) {
                // Failed to choose target, skip assassin voting
                $syndicatesDone = true;
            }
        } elseif ($stage === 'complete') {
            // Voting is complete
            $syndicatesDone = true;
        }

        // Check detectives - all must be locked in (or there are no detectives)
        $detectives = $game['phase1']['detectives'];
        $detectivesDone = (count($detectives) === 0) || (count($game['phase1']['detectiveLockedIn']) >= count($detectives));

        // Check bystanders - all must have voted (or there are no bystanders)
        $bystanders = $game['phase1']['bystanders'];
        $bystanderVoteCount = count($game['phase1']['bystanderVotes']);
        $bystandersDone = (count($bystanders) === 0) || ($bystanderVoteCount >= count($bystanders));
        
        echo "Bystanders: " . count($bystanders) . ", Bystander votes: $bystanderVoteCount\n";

        // Check body guard - if exists, must have chosen
        $bodyGuardDone = true;
        $bodyGuardId = $game['phase1']['bodyGuard'];
        $bodyGuardProtection = $game['phase1']['bodyGuardProtection'];
        if ($bodyGuardId !== null) {
            $bodyGuardDone = $bodyGuardProtection !== null;
        }
        
        echo "BodyGuard ID: " . ($bodyGuardId ?? 'null') . ", Protection: " . ($bodyGuardProtection ?? 'null') . "\n";

        echo "Phase 1 completion check: Syndicates=$syndicatesDone, Detectives=$detectivesDone, Bystanders=$bystandersDone, BodyGuard=$bodyGuardDone (Stage=$stage)\n";

        // Check if ALL alive players have clicked "I'm Done"
        $playersDone = $game['phase1']['playersDone'];
        $totalPlayers = 0;
        foreach ($game['players'] as $p) {
            if ($p['alive'] ?? true) {
                $totalPlayers++;
            }
        }
        $allPlayersDone = count($playersDone) === $totalPlayers;

        echo "Players done: " . count($playersDone) . "/$totalPlayers\n";
        
        if (!$allPlayersDone) {
            echo "Phase 1 not complete yet: Waiting for players. Got " . count($playersDone) . ", need $totalPlayers\n";
            return;
        }

        // Transition to Phase 2 only when ALL players click "I'm Done"
        if ($allPlayersDone && $syndicatesDone && $detectivesDone && $bystandersDone && $bodyGuardDone) {
            echo "All conditions met! Transitioning to Phase 2\n";
            $this->initializePhase2($gameCode);
            
            // Broadcast phase 2 start to all players
            $murderStory = $game['phase2']['murderStory'] ?? 'NOT SET';
            $victimId = $game['phase2']['victimId'] ?? 'NOT SET';
            $assassinId = $game['phase2']['assassinId'] ?? 'NOT SET';
            echo "Broadcasting phase2Start - murderStory: $murderStory, victimId: $victimId, assassinId: $assassinId\n";
            
            // Get only alive players for the player list
            $alivePlayers = [];
            foreach ($game['players'] as $pid => $player) {
                if ($player['alive'] ?? true) {
                    $alivePlayers[] = array_merge($player, ['id' => $pid]);
                }
            }
            
            // Send phase2Start ONLY to alive players (not eliminated ones!)
            foreach ($game['players'] as $resourceId => $player) {
                if (($player['alive'] ?? true) && ($player['connected'] ?? true) && isset($player['connection'])) {
                    $player['connection']->send(json_encode([
                        'action' => 'phase2Start',
                        'gameStatus' => 'phase2',
                        'murderStory' => $game['phase2']['murderStory'],
                        'victimId' => $game['phase2']['victimId'],
                        'assassinId' => $game['phase2']['assassinId'],
                        'players' => $alivePlayers
                    ]));
                    echo "Sent phase2Start to alive player $resourceId\n";
                } else if (!($player['alive'] ?? true)) {
                    echo "Skipping phase2Start for eliminated player $resourceId\n";
                }
            }
        } else {
            echo "Phase 1 still not complete: Syndicates=$syndicatesDone, Detectives=$detectivesDone, Bystanders=$bystandersDone, BodyGuard=$bodyGuardDone\n";
        }
    }

    private function checkPhase2Complete($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Check if all alive players are ready
        $playersReady = $game['phase2']['playersReady'] ?? [];
        $totalPlayers = 0;
        foreach ($game['players'] as $p) {
            if ($p['alive'] ?? true) {
                $totalPlayers++;
            }
        }
        $allPlayersReady = count($playersReady) === $totalPlayers;
        
        echo "Phase 2 completion check: " . count($playersReady) . "/$totalPlayers players ready\n";
        
        if (!$allPlayersReady) {
            echo "Phase 2 not complete yet: Waiting for players\n";
            return;
        }
        
        echo "All players ready! Transitioning to Phase 3\n";
        
        // Set up victim elimination (copied from handleContinueFromPhase2)
        $victimId = $game['phase2']['victimId'] ?? null;
        $phase1 = &$game['phase1'];
        $bodyGuardProtectedVictim = isset($phase1['bodyGuardProtection']) && $phase1['bodyGuardProtection'] === $victimId;
        
        // Mark whether victim should be eliminated after Phase 3 is sent
        $game['pendingVictimElimination'] = false;
        if ($victimId && isset($game['players'][$victimId]) && !$bodyGuardProtectedVictim) {
            $game['pendingVictimElimination'] = true;
            echo "Victim $victimId will be eliminated after Phase 3 is sent\n";
        } else if ($bodyGuardProtectedVictim) {
            echo "Victim $victimId was protected by body guard and survives!\n";
        }
        
        // Move to Phase 3
        $this->startPhase($gameCode, 3);
    }

    private function getSyndicateRecommendations($gameCode)
    {
        $game = $this->games[$gameCode];
        $recommendations = [];
        
        foreach ($game['phase1']['syndicateVoting']['recommendations'] as $voterId => $targetId) {
            $recommendations[] = [
                'voterId' => $voterId,
                'voterName' => $game['players'][$voterId]['name'],
                'targetId' => $targetId,
                'targetName' => $game['players'][$targetId]['name']
            ];
        }

        // Calculate vote counts per target
        $voteCounts = [];
        foreach ($game['phase1']['syndicateVoting']['recommendations'] as $targetId) {
            if (!isset($voteCounts[$targetId])) {
                $voteCounts[$targetId] = 0;
            }
            $voteCounts[$targetId]++;
        }

        return [
            'recommendations' => $recommendations,
            'voteCounts' => $voteCounts,
            'lockedIn' => array_keys($game['phase1']['syndicateVoting']['lockedIn'])
        ];
    }

    private function broadcastToSyndicates($gameCode, $data)
    {
        $game = $this->games[$gameCode];
        $message = json_encode($data);

        foreach ($game['phase1']['syndicates'] as $resourceId) {
            if (isset($game['players'][$resourceId]) && 
                ($game['players'][$resourceId]['connected'] ?? true) &&
                isset($game['players'][$resourceId]['connection'])) {
                try {
                    $game['players'][$resourceId]['connection']->send($message);
                } catch (\Exception $e) {
                    echo "Error sending to syndicate $resourceId: " . $e->getMessage() . "\n";
                }
            }
        }
    }

    private function getPhase1StateForPlayer($gameCode, $resourceId)
    {
        $game = $this->games[$gameCode];
        $role = $game['roles'][$resourceId] ?? 'Bystander';
        $phase1 = $game['phase1'];

        $playersDone = $phase1['playersDone'] ?? [];
        
        // Get full player list for phase
        $playerList = $this->getPlayerListForPhase($gameCode);
        
        $state = [
            'role' => $role,
            'round' => $game['round'] ?? 1,
            'gameNotes' => $phase1['gameNotes'],
            'players' => $playerList,
            'doneCount' => count($playersDone),
            'amDone' => isset($playersDone[$resourceId]),
            'isHost' => $game['host'] === $resourceId
        ];

        switch ($role) {
            case 'Syndicate':
                $state['syndicateData'] = [
                    'stage' => $phase1['syndicateVoting']['stage'],
                    'recommendations' => $this->getSyndicateRecommendations($gameCode),
                    'target' => $phase1['syndicateVoting']['target'],
                    'assassin' => $phase1['syndicateVoting']['assassin'],
                    'myRecommendation' => $phase1['syndicateVoting']['recommendations'][$resourceId] ?? null,
                    'lockedIn' => isset($phase1['syndicateVoting']['lockedIn'][$resourceId]),
                    'syndicateIds' => $phase1['syndicates']
                ];
                break;

            case 'Detective':
                // Build list of players that can be tagged (all players except self)
                $caseNotesPlayers = [];
                foreach ($game['players'] as $pId => $player) {
                    if ($pId === $resourceId) continue; // Skip self
                    $caseNotesPlayers[] = [
                        'id' => $pId,
                        'name' => $player['name'],
                        'connected' => $player['connected'] ?? true,
                        'alive' => $player['alive'] ?? true
                    ];
                }
                
                // Build list of available roles based on game settings
                $availableRoles = ['Syndicate', 'Detective', 'Bystander', 'Innocent', 'Suspicious'];
                if ($game['settings']['eyeWitness']) {
                    $availableRoles[] = 'Eye Witness';
                }
                if ($game['settings']['bodyGuard']) {
                    $availableRoles[] = 'Body Guard';
                }
                
                $round = $game['round'] ?? 1;
                $state['detectiveData'] = [
                    'investigation' => $phase1['detectiveActions'][$resourceId] ?? null,
                    'lockedIn' => isset($phase1['detectiveLockedIn'][$resourceId]),
                    'canInvestigate' => $round >= 2,
                    'caseNotes' => $game['caseNotes'][$resourceId] ?? [],
                    'caseNotesPlayers' => $caseNotesPlayers,
                    'availableRoles' => $availableRoles
                ];
                break;

            case 'Body Guard':
                $state['bodyGuardData'] = [
                    'protecting' => $phase1['bodyGuardProtection']
                ];
                // Fall through to also get bystander data
            
            default: // Bystander, Eye Witness
                $state['bystanderData'] = [
                    'myVote' => $phase1['bystanderVotes'][$resourceId] ?? null
                ];
                break;
        }

        return $state;
    }

    private function getPlayerListForPhase($gameCode)
    {
        $game = $this->games[$gameCode];
        $players = [];
        
        foreach ($game['players'] as $resourceId => $player) {
            $players[] = [
                'id' => $resourceId,
                'name' => $player['name'],
                'connected' => $player['connected'] ?? true,
                'alive' => $player['alive'] ?? true
            ];
        }
        
        return $players;
    }

    private function handleContinueFromPhase2(ConnectionInterface $conn, $data)
    {
        echo "handleContinueFromPhase2 called\n";
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        echo "handleContinueFromPhase2: gameCode=$gameCode, playerId=$playerId\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "handleContinueFromPhase2: Game not found\n";
            return;
        }

        $game = &$this->games[$gameCode];
        
        echo "handleContinueFromPhase2: host={$game['host']}, playerId=$playerId\n";
        
        // Only host can continue
        if ($game['host'] !== $playerId) {
            echo "handleContinueFromPhase2: Player $playerId is not host ({$game['host']})\n";
            return;
        }
        if (!isset($game['phase2'])) {
            echo "handleContinueFromPhase2: phase2 not set\n";
            return;
        }

        // Store victim info for later processing (after Phase 3 messages are sent)
        $victimId = $game['phase2']['victimId'];
        $phase1 = &$game['phase1'];
        $bodyGuardProtectedVictim = isset($phase1['bodyGuardProtection']) && $phase1['bodyGuardProtection'] === $victimId;
        
        // Mark whether victim should be eliminated after Phase 3 is sent
        $game['pendingVictimElimination'] = false;
        if ($victimId && isset($game['players'][$victimId]) && !$bodyGuardProtectedVictim) {
            $game['pendingVictimElimination'] = true;
            echo "Victim $victimId will be eliminated after Phase 3 is sent\n";
        } else if ($bodyGuardProtectedVictim) {
            echo "Victim $victimId was protected by body guard and survives!\n";
        }

        // Move to phase 3 - startPhase will send the proper phase3Start message
        echo "Moving to Phase 3...\n";
        $this->startPhase($gameCode, 3);
    }

    private function handlePlayerReadyPhase3(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->playerConnections[$conn->resourceId] ?? null;
        if (!$gameCode || !isset($this->games[$gameCode])) return;

        $game = &$this->games[$gameCode];
        $playerId = $conn->resourceId;

        if (!isset($game['phase3'])) {
            echo "Phase 3 not initialized!\n";
            return;
        }

        // Mark player as ready for phase 3
        if (!isset($game['phase3']['playersReady'])) {
            $game['phase3']['playersReady'] = [];
        }

        $game['phase3']['playersReady'][$playerId] = true;
        $readyCount = count($game['phase3']['playersReady']);
        $aliveCount = count($game['phase3']['alivePlayers']);

        echo "Player {$playerId} ready for phase 3: {$readyCount}/{$aliveCount}\n";

        // Broadcast update
        $this->broadcastToGame($gameCode, [
            'action' => 'phase3ReadyUpdate',
            'readyCount' => $readyCount,
            'totalAlive' => $aliveCount
        ]);

        // Check if all alive players are ready to move to next phase
        if ($readyCount === $aliveCount) {
            echo "All alive players ready! Moving to Phase 4\n";
            // TODO: Implement Phase 4 transition
            // For now, just log it
        }
    }

    private function initializePhase3($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Phase 3 is Group Discussion - players discuss what happened
        // Include only alive players
        $alivePlayers = [];
        foreach ($game['players'] as $resourceId => $player) {
            if ($player['alive'] ?? true) {
                $alivePlayers[$resourceId] = $player;
            }
        }

        $game['phase3'] = [
            'alivePlayers' => array_keys($alivePlayers),
            'playerCount' => count($alivePlayers),
            'playersReady' => [],
            'playersDone' => [] // Track who's done with discussion
        ];
    }

    private function handlePlayerDonePhase3(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        
        echo "handlePlayerDonePhase3 - gameCode: {$gameCode}, playerId: {$playerId}\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "Game not found!\n";
            return;
        }

        $game = &$this->games[$gameCode];
        if (!isset($game['phase3'])) {
            echo "Phase3 not initialized!\n";
            return;
        }
        
        // Count total alive players
        $totalCount = 0;
        foreach ($game['players'] as $p) {
            if ($p['alive'] ?? true) {
                $totalCount++;
            }
        }

        $game['phase3']['playersDone'][$playerId] = true;
        $doneCount = count($game['phase3']['playersDone']);

        echo "Player {$playerId} marked done for Phase 3: {$doneCount}/{$totalCount}\n";
        echo "Alive players: " . json_encode($game['phase3']['alivePlayers']) . "\n";
        echo "Done players: " . json_encode(array_keys($game['phase3']['playersDone'])) . "\n";

        // Broadcast update to all players
        $message = [
            'action' => 'phase3DoneUpdate',
            'doneCount' => $doneCount,
            'totalPlayers' => $totalCount
        ];
        echo "Broadcasting: " . json_encode($message) . "\n";
        $this->broadcastToGame($gameCode, $message);

        // Check if all alive players are done
        if ($doneCount >= $totalCount) {
            echo "All players done with Phase 3! Moving to Phase 4 (Voting)\n";
            $this->startPhase($gameCode, 4);
        }
    }

    // ==================== PHASE 4: VOTING ====================
    
    private function initializePhase4($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Include only alive players
        $alivePlayers = [];
        foreach ($game['players'] as $resourceId => $player) {
            if ($player['alive'] ?? true) {
                $alivePlayers[$resourceId] = $player;
            }
        }

        $game['phase4'] = [
            'alivePlayers' => array_keys($alivePlayers),
            'playerCount' => count($alivePlayers),
            'votes' => []
        ];
        
        echo "Phase 4 initialized with " . count($alivePlayers) . " alive players\n";
    }

    private function handleCastVote(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        $targetId = $data['targetId'] ?? null;
        
        echo "handleCastVote - gameCode: {$gameCode}, playerId: {$playerId}, targetId: {$targetId}\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "Game not found!\n";
            return;
        }
        
        if (!$targetId) {
            echo "No target specified!\n";
            return;
        }

        $game = &$this->games[$gameCode];
        if (!isset($game['phase4'])) {
            echo "Phase4 not initialized!\n";
            return;
        }

        // Record the vote
        $game['phase4']['votes'][$playerId] = $targetId;
        $voteCount = count($game['phase4']['votes']);
        $totalCount = count($game['phase4']['alivePlayers']);
        
        // Store voting history for detective investigation
        $round = $game['round'] ?? 1;
        if (!isset($game['votingHistory'])) {
            $game['votingHistory'] = [];
        }
        if (!isset($game['votingHistory'][$round])) {
            $game['votingHistory'][$round] = [];
        }
        $game['votingHistory'][$round][$playerId] = $targetId;

        echo "Player {$playerId} voted for {$targetId}: {$voteCount}/{$totalCount}\n";

        // Broadcast update
        $message = [
            'action' => 'phase4VoteUpdate',
            'voteCount' => $voteCount,
            'totalPlayers' => $totalCount
        ];
        $this->broadcastToGame($gameCode, $message);

        // Check if all alive players have voted
        if ($voteCount >= $totalCount) {
            echo "All votes in! Tallying results...\n";
            $this->tallyVotesAndStartTrial($gameCode);
        }
    }

    private function tallyVotesAndStartTrial($gameCode)
    {
        $game = &$this->games[$gameCode];
        $votes = $game['phase4']['votes'];
        
        // Count votes for each player
        $voteCounts = [];
        foreach ($votes as $voterId => $targetId) {
            if (!isset($voteCounts[$targetId])) {
                $voteCounts[$targetId] = 0;
            }
            $voteCounts[$targetId]++;
        }
        
        // Find player with most votes
        arsort($voteCounts);
        $accusedId = array_key_first($voteCounts);
        $accusedVotes = $voteCounts[$accusedId];
        
        echo "Vote results: " . json_encode($voteCounts) . "\n";
        echo "Accused: {$accusedId} with {$accusedVotes} votes\n";
        
        // Store accused for trial
        $game['accusedId'] = $accusedId;
        $game['accusedName'] = $game['players'][$accusedId]['name'];
        
        // Move to Phase 5 (Trial)
        $this->startPhase($gameCode, 5);
    }

    // ==================== PHASE 5: TRIAL ====================
    
    private function initializePhase5($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Include only alive players (who can vote)
        $alivePlayers = [];
        foreach ($game['players'] as $resourceId => $player) {
            if ($player['alive'] ?? true) {
                $alivePlayers[$resourceId] = $player;
            }
        }

        $game['phase5'] = [
            'alivePlayers' => array_keys($alivePlayers),
            'playerCount' => count($alivePlayers),
            'guiltyVotes' => [],
            'notGuiltyVotes' => [],
            'accusedId' => $game['accusedId'],
            'accusedName' => $game['accusedName']
        ];
        
        echo "Phase 5 initialized. {$game['accusedName']} is on trial.\n";
    }

    private function handleCastTrialVote(ConnectionInterface $conn, $data)
    {
        $gameCode = $this->getGameCode($conn, $data);
        $playerId = $this->getPlayerId($conn, $data);
        $vote = $data['vote'] ?? null;
        
        echo "handleCastTrialVote - gameCode: {$gameCode}, playerId: {$playerId}, vote: {$vote}\n";
        
        if (!$gameCode || !isset($this->games[$gameCode])) {
            echo "Game not found!\n";
            return;
        }
        
        if (!$vote || !in_array($vote, ['guilty', 'not-guilty'])) {
            echo "Invalid vote!\n";
            return;
        }

        $game = &$this->games[$gameCode];
        if (!isset($game['phase5'])) {
            echo "Phase5 not initialized!\n";
            return;
        }

        // Record the vote
        if ($vote === 'guilty') {
            $game['phase5']['guiltyVotes'][$playerId] = true;
        } else {
            $game['phase5']['notGuiltyVotes'][$playerId] = true;
        }
        
        $guiltyCount = count($game['phase5']['guiltyVotes']);
        $notGuiltyCount = count($game['phase5']['notGuiltyVotes']);
        $totalVotes = $guiltyCount + $notGuiltyCount;
        $totalPlayers = count($game['phase5']['alivePlayers']);

        echo "Trial vote: {$guiltyCount} guilty, {$notGuiltyCount} not guilty ({$totalVotes}/{$totalPlayers})\n";

        // Broadcast update
        $message = [
            'action' => 'phase5VoteUpdate',
            'guiltyCount' => $guiltyCount,
            'notGuiltyCount' => $notGuiltyCount,
            'totalVotes' => $totalVotes,
            'totalPlayers' => $totalPlayers
        ];
        $this->broadcastToGame($gameCode, $message);

        // Check if all alive players have voted
        if ($totalVotes >= $totalPlayers) {
            echo "All trial votes in! Determining verdict...\n";
            $this->determineVerdict($gameCode);
        }
    }

    private function determineVerdict($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        $guiltyCount = count($game['phase5']['guiltyVotes']);
        $notGuiltyCount = count($game['phase5']['notGuiltyVotes']);
        $accusedId = $game['phase5']['accusedId'];
        $accusedName = $game['phase5']['accusedName'];
        $accusedRole = $game['roles'][$accusedId] ?? 'Unknown';
        
        echo "Verdict: {$guiltyCount} guilty, {$notGuiltyCount} not guilty\n";
        
        if ($guiltyCount > $notGuiltyCount) {
            // GUILTY - Player is eliminated
            echo "{$accusedName} found GUILTY! Eliminating from game.\n";
            
            $game['players'][$accusedId]['alive'] = false;
            
            // Store elimination data for later retrieval
            if (!isset($game['eliminationHistory'])) {
                $game['eliminationHistory'] = [];
            }
            $game['eliminationHistory'][$accusedId] = [
                'playerId' => $accusedId,
                'playerName' => $accusedName,
                'role' => $accusedRole,
                'verdict' => 'GUILTY'
            ];
            
            // Broadcast elimination (without revealing role - that's only shown at game end)
            $this->broadcastToGame($gameCode, [
                'action' => 'playerEliminated',
                'playerId' => $accusedId,
                'playerName' => $accusedName,
                'verdict' => 'GUILTY'
            ]);
            
            // Check win conditions
            if (!$this->checkGameEnd($gameCode)) {
                // Game continues - start next round
                $this->startNextRound($gameCode);
            }
        } else {
            // NOT GUILTY - Player remains in game
            echo "{$accusedName} found NOT GUILTY! Starting next round.\n";
            
            // Broadcast result
            $this->broadcastToGame($gameCode, [
                'action' => 'trialVerdict',
                'playerId' => $accusedId,
                'playerName' => $accusedName,
                'verdict' => 'NOT GUILTY'
            ]);
            
            // Start next round
            $this->startNextRound($gameCode);
        }
    }

    private function checkGameEnd($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        // Count alive players by role
        $aliveSyndicate = 0;
        $aliveInnocent = 0;
        
        foreach ($game['players'] as $playerId => $player) {
            if (!($player['alive'] ?? true)) continue;
            
            $role = $game['roles'][$playerId] ?? '';
            if ($role === 'Syndicate') {
                $aliveSyndicate++;
            } else {
                $aliveInnocent++;
            }
        }
        
        echo "Game state: {$aliveSyndicate} syndicate, {$aliveInnocent} innocent alive\n";
        
        // Build player results data
        $playerResults = $this->buildPlayerResults($gameCode);
        
        // Syndicate wins if they equal or outnumber innocents
        if ($aliveSyndicate >= $aliveInnocent) {
            echo "SYNDICATE WINS!\n";
            $this->broadcastToGame($gameCode, [
                'action' => 'gameEnd',
                'winner' => 'Syndicate',
                'message' => 'The Syndicate has taken over the city!',
                'playerResults' => $playerResults
            ]);
            return true;
        }
        
        // Innocents win if all Syndicate are eliminated
        if ($aliveSyndicate === 0) {
            echo "INNOCENTS WIN!\n";
            $this->broadcastToGame($gameCode, [
                'action' => 'gameEnd',
                'winner' => 'Innocents',
                'message' => 'The Syndicate has been defeated! The city is safe.',
                'playerResults' => $playerResults
            ]);
            return true;
        }
        
        return false;
    }
    
    private function buildPlayerResults($gameCode)
    {
        $game = &$this->games[$gameCode];
        $results = [];
        $votingHistory = $game['votingHistory'] ?? [];
        
        foreach ($game['players'] as $playerId => $player) {
            $role = $game['roles'][$playerId] ?? 'Unknown';
            $alive = $player['alive'] ?? true;
            
            // Calculate suspicion score based on voting history
            $suspicionScore = $this->calculateSuspicionScore($playerId, $votingHistory, $game['roles']);
            
            $results[] = [
                'id' => $playerId,
                'name' => $player['name'],
                'role' => $role,
                'alive' => $alive,
                'suspicion' => $suspicionScore
            ];
        }
        
        return $results;
    }
    
    private function calculateSuspicionScore($playerId, $votingHistory, $roles)
    {
        $playerRole = $roles[$playerId] ?? '';
        $isSyndicate = ($playerRole === 'Syndicate');
        
        // Points that indicate suspicious behavior
        $suspicionPoints = 0;
        $totalVotes = 0;
        
        foreach ($votingHistory as $round => $roundVotes) {
            if (!isset($roundVotes[$playerId])) continue;
            
            $targetId = $roundVotes[$playerId];
            $targetRole = $roles[$targetId] ?? '';
            $totalVotes++;
            
            // Suspicious: Syndicate voting for innocent
            // Not suspicious: Syndicate voting for syndicate (protecting)
            // Suspicious: Innocent voting for innocent
            // Not suspicious: Innocent voting for syndicate
            
            if ($isSyndicate) {
                // Syndicate voting for innocent is suspicious
                if ($targetRole !== 'Syndicate') {
                    $suspicionPoints++;
                }
            } else {
                // Innocent voting for innocent is suspicious (might be syndicate)
                if ($targetRole !== 'Syndicate') {
                    $suspicionPoints++;
                }
            }
        }
        
        if ($totalVotes === 0) {
            return 'N/A';
        }
        
        // Calculate percentage of suspicious votes
        $suspicionPercent = round(($suspicionPoints / $totalVotes) * 100);
        
        // Return a label based on percentage
        if ($suspicionPercent >= 80) {
            return 'Very Suspicious';
        } else if ($suspicionPercent >= 60) {
            return 'Suspicious';
        } else if ($suspicionPercent >= 40) {
            return 'Moderate';
        } else if ($suspicionPercent >= 20) {
            return 'Low';
        } else {
            return 'Clear';
        }
    }

    private function startNextRound($gameCode)
    {
        $game = &$this->games[$gameCode];
        
        echo "Starting next round for game {$gameCode}\n";
        
        // Increment round counter
        $game['round'] = ($game['round'] ?? 1) + 1;
        
        // Clear phase data (but keep phase2 for reference in phase3 messages)
        unset($game['phase1']);
        // Keep phase2 for reference in phase 3 special role messages
        unset($game['phase3']);
        unset($game['phase4']);
        unset($game['phase5']);
        unset($game['accusedId']);
        unset($game['accusedName']);
        
        // Initialize Phase 1 for next round
        $this->initializePhase1($gameCode);
        $game['phase'] = 1;
        $game['status'] = 'phase1';
        
        // Build player list
        $playerList = [];
        foreach ($game['players'] as $playerId => $player) {
            $playerList[] = [
                'id' => $playerId,
                'name' => $player['name'],
                'alive' => $player['alive'] ?? true
            ];
        }
        
        // Broadcast next round start
        $isTestGame = $game['isTestGame'] ?? false;
        
        if (!$isTestGame) {
            foreach ($game['players'] as $resourceId => $player) {
                if (($player['connected'] ?? true) && isset($player['connection'])) {
                    if (!($player['alive'] ?? true)) continue; // Don't send to dead players
                    
                    $phaseState = $this->getPhase1StateForPlayer($gameCode, $resourceId);
                    $player['connection']->send(json_encode([
                        'action' => 'nextRoundStart',
                        'round' => $game['round'],
                        'phaseState' => $phaseState
                    ]));
                }
            }
        } else {
            // For test games, broadcast once
            $this->broadcastToGame($gameCode, [
                'action' => 'nextRoundStart',
                'round' => $game['round']
            ]);
        }
    }
}
