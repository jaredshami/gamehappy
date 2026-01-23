<?php
/**
 * GameHappy Game Moves API
 * Handles move storage and retrieval for real-time game sync
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

session_start();
$userId = $_SESSION['user_id'] ?? null;

if (!$userId) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

if ($action === 'send_move') {
    sendMove($conn, $userId);
} elseif ($action === 'get_moves') {
    getMoves($conn, $userId);
} else {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid action']);
}

function sendMove($conn, $userId) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $gameCode = $data['game_code'] ?? null;
    $fromRow = $data['from_row'] ?? null;
    $fromCol = $data['from_col'] ?? null;
    $toRow = $data['to_row'] ?? null;
    $toCol = $data['to_col'] ?? null;
    
    if (!$gameCode || $fromRow === null || $fromCol === null || $toRow === null || $toCol === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing move data']);
        return;
    }
    
    // Create moves table if needed
    $conn->query("CREATE TABLE IF NOT EXISTS game_moves (
        id INT PRIMARY KEY AUTO_INCREMENT,
        game_code VARCHAR(6) NOT NULL,
        player_id INT NOT NULL,
        from_row INT NOT NULL,
        from_col INT NOT NULL,
        to_row INT NOT NULL,
        to_col INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
    $stmt = $conn->prepare("INSERT INTO game_moves (game_code, player_id, from_row, from_col, to_row, to_col) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('siiii', $gameCode, $userId, $fromRow, $fromCol, $toRow, $toCol);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Move recorded']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Failed to record move']);
    }
}

function getMoves($conn, $userId) {
    $gameCode = $_GET['game_code'] ?? null;
    $lastMoveId = $_GET['last_move_id'] ?? 0;
    
    if (!$gameCode) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing game_code']);
        return;
    }
    
    // Get moves from other players only, after lastMoveId
    $stmt = $conn->prepare("SELECT id, player_id, from_row, from_col, to_row, to_col FROM game_moves WHERE game_code = ? AND id > ? AND player_id != ? ORDER BY created_at ASC");
    $stmt->bind_param('sii', $gameCode, $lastMoveId, $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $moves = [];
    while ($row = $result->fetch_assoc()) {
        $moves[] = [
            'id' => $row['id'],
            'from' => [$row['from_row'], $row['from_col']],
            'to' => [$row['to_row'], $row['to_col']]
        ];
    }
    
    echo json_encode(['success' => true, 'moves' => $moves]);
}
?>
