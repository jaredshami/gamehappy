<?php
/**
 * User Registration Endpoint
 * VERSION: v2.5-GAMEHAPPY-JAN23-2026
 */

header('Content-Type: application/json');

// MARKER: JAN-23-2026-DEPLOY-001 - Change tracking code word
$VERSION = 'v2.5-GAMEHAPPY-JAN23-2026';
error_log("MARKER: JAN-23-2026-DEPLOY-001 - Register endpoint called at " . date('Y-m-d H:i:s'));

// Catch all errors and convert to JSON
set_error_handler(function($errno, $errstr, $errfile, $errline) {
    http_response_code(500);
    die(json_encode([
        'success' => false,
        'message' => 'PHP Error: ' . $errstr . ' at line ' . $errline
    ]));
});

try {
    require_once __DIR__ . '/Database.php';

    $method = $_SERVER['REQUEST_METHOD'];

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['message' => 'Method not allowed']);
        exit;
    }

    // Get raw input
    $raw_input = file_get_contents('php://input');
    $data = json_decode($raw_input, true);
    
    // Debug: if data is null, json_decode failed
    if ($data === null && !empty($raw_input)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid JSON input: ' . $raw_input
        ]);
        exit;
    }

    $username = trim($data['username'] ?? '');
    $email = trim($data['email'] ?? '');
    $password = $data['password'] ?? '';

    // Validation
    if (empty($username) || empty($email) || empty($password)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Missing required fields'
        ]);
        exit;
    }

    if (strlen($username) < 3 || strlen($username) > 20) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Username must be 3-20 characters'
        ]);
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid email format'
        ]);
        exit;
    }

    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Password must be at least 8 characters'
        ]);
        exit;
    }

    // Initialize database
    $db = new GameHappyDB();
    $db->createTables();
    
    // Check if username exists
    $result = $db->execute(
        "SELECT id FROM users WHERE username = ?",
        [$username]
    );

    if ($result && $result->num_rows > 0) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Username already exists'
        ]);
        exit;
    }

    // Check if email exists
    $result = $db->execute(
        "SELECT id FROM users WHERE email = ?",
        [$email]
    );

    if ($result && $result->num_rows > 0) {
        http_response_code(409);
        echo json_encode([
            'success' => false,
            'message' => 'Email already registered'
        ]);
        exit;
    }

    // Hash password
    $password_hash = password_hash($password, PASSWORD_BCRYPT);

    // Insert user
    $conn = $db->connect();
    $stmt = $conn->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
    
    if (!$stmt) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database prepare error: ' . $conn->error
        ]);
        exit;
    }
    
    $stmt->bind_param("sss", $username, $email, $password_hash);
    
    if (!$stmt->execute()) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Insert failed: ' . $stmt->error
        ]);
        $stmt->close();
        $conn->close();
        exit;
    }
    
    $user_id = $conn->insert_id;
    
    // Create user stats record
    $stmt2 = $conn->prepare("INSERT INTO user_stats (user_id) VALUES (?)");
    if ($stmt2) {
        $stmt2->bind_param("i", $user_id);
        $stmt2->execute();
        $stmt2->close();
    }

    $stmt->close();
    $conn->close();

    echo json_encode([
        'success' => true,
        'message' => 'Account created successfully',
        'userId' => $user_id
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage(),
        'version' => $VERSION,
        'marker' => 'JAN-23-2026-DEPLOY-001'
    ]);
}
?>

