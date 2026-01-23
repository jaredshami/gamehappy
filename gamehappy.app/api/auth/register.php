<?php
/**
 * User Registration Endpoint
 */

require_once __DIR__ . '/Database.php';

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);

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

    // Check if username exists
    $db = new GameHappyDB();
    $result = $db->execute(
        "SELECT id FROM users WHERE username = ?",
        [$username]
    );

    if ($result->num_rows > 0) {
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

    if ($result->num_rows > 0) {
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
    $db = new GameHappyDB();
    $conn = $db->connect();
    $stmt = $conn->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
    
    if (!$stmt) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Database error: ' . $conn->error
        ]);
        $conn->close();
        exit;
    }
    
    $stmt->bind_param("sss", $username, $email, $password_hash);
    
    if ($stmt->execute()) {
        $user_id = $conn->insert_id;
        
        // Create user stats record
        $stmt2 = $conn->prepare("INSERT INTO user_stats (user_id) VALUES (?)");
        if ($stmt2) {
            $stmt2->bind_param("i", $user_id);
            $stmt2->execute();
            $stmt2->close();
        }

        echo json_encode([
            'success' => true,
            'message' => 'Account created successfully',
            'userId' => $user_id
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Registration failed: ' . $stmt->error
        ]);
    }

    $stmt->close();
    $conn->close();
} else {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed']);
}
?>
