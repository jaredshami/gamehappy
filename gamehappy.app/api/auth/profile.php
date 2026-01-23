<?php
/**
 * User Profile Endpoint
 * Get and update user stats
 */

require_once __DIR__ . '/Database.php';

header('Content-Type: application/json');

session_start();

$method = $_SERVER['REQUEST_METHOD'];

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['message' => 'Unauthorized']);
    exit;
}

$user_id = $_SESSION['user_id'];
$db = new GameHappyDB();

if ($method === 'GET') {
    // Get user profile and stats
    $result = $db->execute(
        "SELECT u.id, u.username, u.email, u.created_at, 
                s.elo_rating, s.timed_chess_games, s.timed_chess_wins, 
                s.timed_chess_losses, s.timed_chess_draws
         FROM users u
         LEFT JOIN user_stats s ON u.id = s.user_id
         WHERE u.id = ?",
        [$user_id]
    );

    if ($result->num_rows > 0) {
        echo json_encode([
            'success' => true,
            'user' => $result->fetch_assoc()
        ]);
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'User not found']);
    }
} else if ($method === 'PUT') {
    // Update user stats
    $data = json_decode(file_get_contents('php://input'), true);

    if (isset($data['elo_rating'])) {
        $elo = intval($data['elo_rating']);
        $conn = $db->connect();
        $stmt = $conn->prepare("UPDATE user_stats SET elo_rating = ? WHERE user_id = ?");
        $stmt->bind_param("ii", $elo, $user_id);
        $stmt->execute();
        $stmt->close();
        $conn->close();
    }

    if (isset($data['game_type']) && isset($data['result'])) {
        $game_type = $data['game_type'];
        $result = $data['result'];
        
        if ($game_type === 'timed_chess') {
            $conn = $db->connect();
            
            if ($result === 'win') {
                $stmt = $conn->prepare("UPDATE user_stats SET timed_chess_games = timed_chess_games + 1, timed_chess_wins = timed_chess_wins + 1 WHERE user_id = ?");
            } else if ($result === 'loss') {
                $stmt = $conn->prepare("UPDATE user_stats SET timed_chess_games = timed_chess_games + 1, timed_chess_losses = timed_chess_losses + 1 WHERE user_id = ?");
            } else if ($result === 'draw') {
                $stmt = $conn->prepare("UPDATE user_stats SET timed_chess_games = timed_chess_games + 1, timed_chess_draws = timed_chess_draws + 1 WHERE user_id = ?");
            }
            
            if ($stmt) {
                $stmt->bind_param("i", $user_id);
                $stmt->execute();
                $stmt->close();
            }
            
            $conn->close();
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Stats updated'
    ]);
} else {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
}
?>
