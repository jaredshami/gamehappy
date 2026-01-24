<?php
/**
 * GameHappy Nudge API
 * Handles player nudges and presence checks
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    require_once 'auth/Database.php';
    $db = new GameHappyDB();
    $conn = $db->getConnection();

    $action = $_GET['action'] ?? null;

    session_start();
    $userId = $_SESSION['user_id'] ?? null;

    if (!$userId) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Not authenticated']);
        exit;
    }

    if ($action === 'send_nudge') {
        sendNudge($conn, $userId);
    } elseif ($action === 'check_nudge') {
        checkNudge($conn, $userId);
    } elseif ($action === 'respond_nudge') {
        respondNudge($conn, $userId);
    } else {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Invalid action']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Exception: ' . $e->getMessage()
    ]);
}

function sendNudge($conn, $userId) {
    $data = json_decode(file_get_contents('php://input'), true);
    $gameCode = $data['game_code'] ?? null;

    if (!$gameCode) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing game_code']);
        return;
    }

    // Create nudges table if needed
    $conn->query("CREATE TABLE IF NOT EXISTS game_nudges (
        id INT PRIMARY KEY AUTO_INCREMENT,
        game_code VARCHAR(6) NOT NULL,
        nudged_by_player_id INT NOT NULL,
        nudged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        is_forfeit TINYINT DEFAULT 0,
        FOREIGN KEY (nudged_by_player_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // Insert nudge
    $stmt = $conn->prepare("INSERT INTO game_nudges (game_code, nudged_by_player_id) VALUES (?, ?)");
    $stmt->bind_param('si', $gameCode, $userId);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Nudge sent', 'nudge_id' => $conn->insert_id]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to send nudge']);
    }
}

function checkNudge($conn, $userId) {
    $gameCode = $_GET['game_code'] ?? null;

    if (!$gameCode) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing game_code']);
        return;
    }

    // Create nudges table if needed
    $conn->query("CREATE TABLE IF NOT EXISTS game_nudges (
        id INT PRIMARY KEY AUTO_INCREMENT,
        game_code VARCHAR(6) NOT NULL,
        nudged_by_player_id INT NOT NULL,
        nudged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP NULL,
        is_forfeit TINYINT DEFAULT 0,
        FOREIGN KEY (nudged_by_player_id) REFERENCES users(id) ON DELETE CASCADE
    )");

    // Check for unanswered nudges DIRECTED AT THIS PLAYER (not sent by this player)
    // Only return nudges sent BY other players, not nudges you sent
    $stmt = $conn->prepare("SELECT id, nudged_by_player_id, nudged_at FROM game_nudges WHERE game_code = ? AND nudged_by_player_id != ? AND responded_at IS NULL AND is_forfeit = 0 ORDER BY nudged_at DESC LIMIT 1");
    $stmt->bind_param('si', $gameCode, $userId);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($row = $result->fetch_assoc()) {
        // Check if 30 seconds have passed since nudge
        $nudgeTime = strtotime($row['nudged_at']);
        $currentTime = time();
        $secondsElapsed = $currentTime - $nudgeTime;

        if ($secondsElapsed > 30) {
            // Player forfeited - update nudge record
            $updateStmt = $conn->prepare("UPDATE game_nudges SET is_forfeit = 1 WHERE id = ?");
            $updateStmt->bind_param('i', $row['id']);
            $updateStmt->execute();

            echo json_encode([
                'success' => true,
                'has_nudge' => true,
                'forfeit' => true,
                'nudged_by_player_id' => $row['nudged_by_player_id']
            ]);
        } else {
            echo json_encode([
                'success' => true,
                'has_nudge' => true,
                'forfeit' => false,
                'nudge_id' => $row['id'],
                'seconds_remaining' => 30 - $secondsElapsed,
                'nudged_by_player_id' => $row['nudged_by_player_id']
            ]);
        }
    } else {
        echo json_encode(['success' => true, 'has_nudge' => false]);
    }
}

function respondNudge($conn, $userId) {
    $data = json_decode(file_get_contents('php://input'), true);
    $nudgeId = $data['nudge_id'] ?? null;

    if (!$nudgeId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing nudge_id']);
        return;
    }

    $stmt = $conn->prepare("UPDATE game_nudges SET responded_at = NOW() WHERE id = ?");
    $stmt->bind_param('i', $nudgeId);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Response recorded']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record response']);
    }
}
