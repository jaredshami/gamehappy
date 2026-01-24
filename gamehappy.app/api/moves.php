<?php
/**
 * GameHappy Game Moves API
 * Handles move storage and retrieval for real-time game sync
 */

// Global error handler to ensure JSON response
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Server error: ' . $errstr,
        'error' => $errstr,
        'line' => $errline
    ]);
    exit;
});

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
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
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Exception: ' . $e->getMessage()
    ]);
}

function sendMove($conn, $userId) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $gameCode = $data['game_code'] ?? null;
    $fromRow = $data['from_row'] ?? null;
    $fromCol = $data['from_col'] ?? null;
    $toRow = $data['to_row'] ?? null;
    $toCol = $data['to_col'] ?? null;
    $isPawnDoubleMove = $data['is_pawn_double_move'] ?? 0;
    
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
        is_pawn_double_move TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
    // Add is_pawn_double_move column if it doesn't exist (for existing tables)
    $conn->query("ALTER TABLE game_moves ADD COLUMN IF NOT EXISTS is_pawn_double_move TINYINT DEFAULT 0");
    
    $stmt = $conn->prepare("INSERT INTO game_moves (game_code, player_id, from_row, from_col, to_row, to_col, is_pawn_double_move) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('siiiiii', $gameCode, $userId, $fromRow, $fromCol, $toRow, $toCol, $isPawnDoubleMove);
    
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
    
    // Create moves table if needed
    $conn->query("CREATE TABLE IF NOT EXISTS game_moves (
        id INT PRIMARY KEY AUTO_INCREMENT,
        game_code VARCHAR(6) NOT NULL,
        player_id INT NOT NULL,
        from_row INT NOT NULL,
        from_col INT NOT NULL,
        to_row INT NOT NULL,
        to_col INT NOT NULL,
        is_pawn_double_move TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE
    )");
    
    // Add is_pawn_double_move column if it doesn't exist (for existing tables)
    $conn->query("ALTER TABLE game_moves ADD COLUMN IF NOT EXISTS is_pawn_double_move TINYINT DEFAULT 0");
    
    // Get moves from other players only, after lastMoveId
    $stmt = $conn->prepare("SELECT id, player_id, from_row, from_col, to_row, to_col, COALESCE(is_pawn_double_move, 0) as is_pawn_double_move FROM game_moves WHERE game_code = ? AND id > ? AND player_id != ? ORDER BY created_at ASC");
    $stmt->bind_param('sii', $gameCode, $lastMoveId, $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $moves = [];
    while ($row = $result->fetch_assoc()) {
        $moves[] = [
            'id' => $row['id'],
            'from' => [$row['from_row'], $row['from_col']],
            'to' => [$row['to_row'], $row['to_col']],
            'is_pawn_double_move' => (bool)$row['is_pawn_double_move']
        ];
    }
    
    echo json_encode(['success' => true, 'moves' => $moves]);
}
?>
