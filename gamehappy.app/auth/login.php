<?php
session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$action = basename($_SERVER['REQUEST_URI']);

if ($action === 'login.php') {
    handleLogin();
} elseif ($action === 'logout.php') {
    handleLogout();
} elseif ($action === 'check-session.php') {
    handleCheckSession();
} else {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'Not found']);
}

function handleLogin() {
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? '';
    $password = $input['password'] ?? '';
    $rememberMe = $input['rememberMe'] ?? false;

    // Load admin credentials from config file
    $config_file = '/var/www/gamehappy.app/config/admin-credentials.json';
    
    if (!file_exists($config_file)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Admin configuration not found']);
        return;
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
        
        if ($rememberMe) {
            setcookie('admin_token', bin2hex(random_bytes(32)), time() + (30 * 24 * 60 * 60), '/');
        }

        echo json_encode(['success' => true, 'message' => 'Login successful']);
    } else {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Invalid username or password']);
    }
}

function handleLogout() {
    $_SESSION = [];
    session_destroy();
    setcookie('admin_token', '', time() - 3600, '/');
    echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
}

function handleCheckSession() {
    if (isset($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in']) {
        echo json_encode(['authenticated' => true, 'username' => $_SESSION['admin_username'] ?? '']);
    } else {
        echo json_encode(['authenticated' => false]);
    }
}
?>
