<?php
session_start();
header('Content-Type: application/json');

$input = json_decode(file_get_contents('php://input'), true);
$username = $input['username'] ?? '';
$password = $input['password'] ?? '';

// Load admin credentials from config file
$config_file = '/var/www/gamehappy.app/config/admin-credentials.json';

if (!file_exists($config_file)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Admin configuration not found']);
    exit;
}

$config = json_decode(file_get_contents($config_file), true);

// Verify credentials
$authenticated = false;
foreach ($config['admins'] ?? [] as $admin) {
    if ($admin['username'] === $username && password_verify($password, $admin['password_hash'])) {
        $authenticated = true;
        break;
    }
}

if ($authenticated) {
    $_SESSION['admin_logged_in'] = true;
    $_SESSION['admin_username'] = $username;
    $_SESSION['login_time'] = time();

    echo json_encode(['success' => true, 'message' => 'Login successful']);
} else {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
}
?>

