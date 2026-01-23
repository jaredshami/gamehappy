<?php
/**
 * GameHappy Matchmaking API
 * Handles player queue and matchmaking for Friendly Chess
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database connection
require_once 'auth/Database.php';
$db = new GameHappyDB();
$conn = $db->getConnection();

$action = $_GET['action'] ?? null;

// Check if user is logged in
session_start();
$userId = $_SESSION['user_id'] ?? null;
$username = $_SESSION['username'] ?? null;

if (!$userId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

if ($action === 'join_queue') {
    joinQueue($conn, $userId, $username);
} elseif ($action === 'check_match') {
    checkMatch($conn, $userId);
} elseif ($action === 'leave_queue') {
    leaveQueue($conn, $userId);
} elseif ($action === 'get_queue_status') {
    getQueueStatus($conn, $userId);
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function joinQueue($conn, $userId, $username) {
    // Clean up old stale queue entries (older than 10 minutes)
    $conn->query("DELETE FROM matchmaking_queue WHERE status = 'waiting' AND joined_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)");

    // Remove any existing queue entry for this user (cancel previous search)
    $stmt = $conn->prepare("DELETE FROM matchmaking_queue WHERE user_id = ? AND status = 'waiting'");
    $stmt->bind_param('i', $userId);
    $stmt->execute();

    // Add player to queue
    $stmt = $conn->prepare("INSERT INTO matchmaking_queue (user_id, username, status, joined_at) VALUES (?, ?, 'waiting', NOW())");
    $stmt->bind_param('is', $userId, $username);
    
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to join queue: ' . $conn->error]);
        return;
    }

    // Try to match players
    attemptMatch($conn);

    echo json_encode(['success' => true, 'message' => 'Joined queue', 'queue_position' => getQueuePosition($conn, $userId)]);
}

function attemptMatch($conn) {
    // Find two waiting players
    $stmt = $conn->prepare("SELECT id, user_id, username FROM matchmaking_queue WHERE status = 'waiting' ORDER BY joined_at ASC LIMIT 2");
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 2) {
        $players = [];
        while ($row = $result->fetch_assoc()) {
            $players[] = $row;
        }

        $player1Id = $players[0]['user_id'];
        $player2Id = $players[1]['user_id'];
        $gameCode = generateGameCode();

        // Create game session
        $stmt = $conn->prepare("INSERT INTO game_sessions (game_type, player1_id, player2_id, game_code, status, created_at) VALUES ('friendly', ?, ?, ?, 'active', NOW())");
        $stmt->bind_param('iis', $player1Id, $player2Id, $gameCode);
        
        if ($stmt->execute()) {
            // Update queue status to 'matched' with game_code
            $stmt = $conn->prepare("UPDATE matchmaking_queue SET status = 'matched', game_code = ? WHERE user_id IN (?, ?)");
            $stmt->bind_param('sii', $gameCode, $player1Id, $player2Id);
            $stmt->execute();
        }
    }
}

function checkMatch($conn, $userId) {
    $stmt = $conn->prepare("SELECT status, game_code FROM matchmaking_queue WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        echo json_encode(['success' => false, 'message' => 'Not in queue']);
        return;
    }

    $row = $result->fetch_assoc();

    if ($row['status'] === 'matched') {
        // Get opponent info
        $stmt = $conn->prepare("SELECT user_id, username FROM matchmaking_queue WHERE game_code = ? AND user_id != ?");
        $stmt->bind_param('si', $row['game_code'], $userId);
        $stmt->execute();
        $opponentResult = $stmt->get_result();
        $opponent = $opponentResult->fetch_assoc();

        echo json_encode([
            'success' => true,
            'matched' => true,
            'game_code' => $row['game_code'],
            'opponent_id' => $opponent['user_id'],
            'opponent_name' => $opponent['username'],
            'your_color' => rand(0, 1) ? 'white' : 'black'
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'matched' => false,
            'queue_position' => getQueuePosition($conn, $userId),
            'players_waiting' => getTotalWaiting($conn)
        ]);
    }
}

function leaveQueue($conn, $userId) {
    $stmt = $conn->prepare("UPDATE matchmaking_queue SET status = 'cancelled' WHERE user_id = ? AND status = 'waiting'");
    $stmt->bind_param('i', $userId);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Left queue']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to leave queue']);
    }
}

function getQueueStatus($conn, $userId) {
    $stmt = $conn->prepare("SELECT status, game_code, joined_at FROM matchmaking_queue WHERE user_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result->num_rows === 0) {
        echo json_encode(['success' => true, 'in_queue' => false]);
        return;
    }

    $row = $result->fetch_assoc();
    echo json_encode([
        'success' => true,
        'in_queue' => true,
        'status' => $row['status'],
        'queue_position' => getQueuePosition($conn, $userId),
        'players_waiting' => getTotalWaiting($conn),
        'joined_at' => $row['joined_at']
    ]);
}

function getQueuePosition($conn, $userId) {
    $stmt = $conn->prepare("SELECT COUNT(*) as position FROM matchmaking_queue WHERE status = 'waiting' AND joined_at <= (SELECT joined_at FROM matchmaking_queue WHERE user_id = ? LIMIT 1)");
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    return $row['position'];
}

function getTotalWaiting($conn) {
    $result = $conn->query("SELECT COUNT(*) as total FROM matchmaking_queue WHERE status = 'waiting'");
    $row = $result->fetch_assoc();
    return $row['total'];
}

function generateGameCode() {
    return strtoupper(substr(str_shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 0, 6));
}
?>
