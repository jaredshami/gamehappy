<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

// Check authentication
if (!isset($_SESSION['admin_logged_in']) || !$_SESSION['admin_logged_in']) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$data_dir = '/var/www/gamehappy.app/data';
$contact_dir = $data_dir . '/contact-submissions';

// Get contact message count
$messages_count = 0;
if (is_dir($contact_dir)) {
    $messages_count = count(glob($contact_dir . '/*.json'));
}

// Default stats
$stats = [
    'activeUsers' => 0,
    'activeGames' => 0,
    'ss_total' => 0,
    'ss_active' => 0,
    'ss_rounds' => 0,
    'ss_players' => 0,
    'timestamp' => date('Y-m-d H:i:s')
];

// Try to get game-history data from websocket server
$game_history_file = '/var/www/gamehappy.app/game-history.json';
if (file_exists($game_history_file)) {
    $history = json_decode(file_get_contents($game_history_file), true);
    if ($history) {
        // Get Secret Syndicates stats
        if (isset($history['secret_syndicates'])) {
            $ss_games = $history['secret_syndicates'];
            $stats['ss_total'] = count($ss_games);
            
            $now = time();
            $active_count = 0;
            $total_rounds = 0;
            $unique_players = [];
            
            foreach ($ss_games as $game) {
                if (isset($game['created_at'])) {
                    $game_time = strtotime($game['created_at']);
                    if ($now - $game_time < 1800) { // 30 minutes
                        $active_count++;
                    }
                }
                $total_rounds += $game['rounds'] ?? 0;
                foreach ($game['players'] ?? [] as $player) {
                    $unique_players[$player] = true;
                }
            }
            
            $stats['ss_active'] = $active_count;
            $stats['ss_rounds'] = $total_rounds;
            $stats['ss_players'] = count($unique_players);
        }
    }
}

// Simulate some live data (in production, this would come from websocket server)
$stats['activeUsers'] = max(1, $stats['ss_players']);
$stats['activeGames'] = $stats['ss_active'];

echo json_encode($stats);
?>
