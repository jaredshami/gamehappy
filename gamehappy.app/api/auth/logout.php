<?php
/**
 * User Logout Endpoint
 */

header('Content-Type: application/json');

session_start();
session_destroy();

// Clear cookies
setcookie('gamehappy_user_id', '', time() - 3600, '/');
setcookie('gamehappy_token', '', time() - 3600, '/');

echo json_encode([
    'success' => true,
    'message' => 'Logged out successfully'
]);
?>
