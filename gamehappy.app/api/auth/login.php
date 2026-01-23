<?php
/**
 * User Login Endpoint
 * Creates session and returns user data
 */

require_once __DIR__ . '/Database.php';

header('Content-Type: application/json');

session_start();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

    $username = trim($data['username'] ?? '');
    $password = $data['password'] ?? '';
    $remember = $data['remember'] ?? false;

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Missing username or password'
        ]);
        exit;
    }

    $db = new GameHappyDB();
    $db->createTables(); // Ensure tables exist

    // Find user by username or email
    $result = $db->execute(
        "SELECT id, username, email, password_hash FROM users WHERE username = ? OR email = ?",
        [$username, $username]
    );

    if ($result->num_rows === 0) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid username or password'
        ]);
        exit;
    }

    $user = $result->fetch_assoc();

    // Verify password
    if (!password_verify($password, $user['password_hash'])) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid username or password'
        ]);
        exit;
    }

    // Update last login
    $conn = $db->connect();
    $stmt = $conn->prepare("UPDATE users SET last_login = NOW() WHERE id = ?");
    $stmt->bind_param("i", $user['id']);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    // Set session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['email'] = $user['email'];

    // Set remember me cookie if requested
    if ($remember) {
        setcookie('gamehappy_user_id', $user['id'], time() + (30 * 24 * 60 * 60), '/');
        setcookie('gamehappy_token', hash('sha256', $user['id'] . $user['username']), time() + (30 * 24 * 60 * 60), '/');
    }

    echo json_encode([
        'success' => true,
        'message' => 'Login successful',
        'userId' => $user['id'],
        'username' => $user['username'],
        'email' => $user['email']
    ]);
} else {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
}
?>
