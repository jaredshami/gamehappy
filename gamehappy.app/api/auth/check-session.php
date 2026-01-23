<?php
/**
 * Session Check Endpoint
 * Verifies if user is logged in
 */

header('Content-Type: application/json');

session_start();

// Check session
if (isset($_SESSION['user_id'])) {
    echo json_encode([
        'authenticated' => true,
        'loggedIn' => true,
        'userId' => $_SESSION['user_id'],
        'username' => $_SESSION['username'],
        'email' => $_SESSION['email']
    ]);
} else if (isset($_COOKIE['gamehappy_user_id'])) {
    // Check remember me cookie
    require_once __DIR__ . '/Database.php';
    $db = new GameHappyDB();
    
    $user_id = intval($_COOKIE['gamehappy_user_id']);
    $result = $db->execute(
        "SELECT id, username, email FROM users WHERE id = ?",
        [$user_id]
    );

    if ($result->num_rows > 0) {
        $user = $result->fetch_assoc();
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['email'] = $user['email'];

        echo json_encode([
            'authenticated' => true,
            'loggedIn' => true,
            'userId' => $user['id'],
            'username' => $user['username'],
            'email' => $user['email']
        ]);
    } else {
        echo json_encode([
            'authenticated' => false,
            'loggedIn' => false
        ]);
    }
} else {
    echo json_encode([
        'authenticated' => false,
        'loggedIn' => false
    ]);
}
?>
