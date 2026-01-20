<?php
session_start();
header('Content-Type: application/json');

$_SESSION = [];
session_destroy();
setcookie('admin_token', '', time() - 3600, '/');

echo json_encode(['success' => true, 'message' => 'Logged out successfully']);
?>
