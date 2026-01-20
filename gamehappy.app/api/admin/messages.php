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

$contact_dir = '/var/www/gamehappy.app/data/contact-submissions';
$messages = [];

if (is_dir($contact_dir)) {
    $files = glob($contact_dir . '/*.json');
    foreach ($files as $file) {
        $content = json_decode(file_get_contents($file), true);
        if ($content) {
            $messages[] = $content;
        }
    }
}

echo json_encode([
    'messages' => $messages,
    'count' => count($messages)
]);
?>
