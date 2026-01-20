<?php
// This is a setup script to create admin credentials
// Run this once to initialize the admin user

$config = [
    'admins' => [
        [
            'username' => 'admin',
            'password_hash' => password_hash('admin123', PASSWORD_BCRYPT),
            'email' => 'admin@gamehappy.app',
            'created_at' => date('Y-m-d H:i:s')
        ]
    ]
];

$config_dir = '/var/www/gamehappy.app/config';
if (!is_dir($config_dir)) {
    mkdir($config_dir, 0755, true);
}

$config_file = $config_dir . '/admin-credentials.json';
file_put_contents($config_file, json_encode($config, JSON_PRETTY_PRINT));
chmod($config_file, 0600); // Restrict to owner only

echo json_encode([
    'success' => true,
    'message' => 'Admin credentials initialized',
    'credentials' => [
        'username' => 'admin',
        'password' => 'admin123',
        'note' => 'Default credentials. Change these immediately in production!'
    ]
]);
?>
