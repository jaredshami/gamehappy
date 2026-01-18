<?php
// Save contact form submissions to JSON file
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get JSON data from request
$json = file_get_contents('php://input');
$data = json_decode($json, true);

// Validate required fields
$required_fields = ['name', 'email', 'subject', 'message'];
foreach ($required_fields as $field) {
    if (empty($data[$field])) {
        http_response_code(400);
        echo json_encode(['error' => "Missing required field: {$field}"]);
        exit;
    }
}

// Validate email format
if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email format']);
    exit;
}

// Directory to store contact submissions
$submissions_dir = __DIR__ . '/data/contact-submissions';

// Create directory if it doesn't exist
if (!is_dir($submissions_dir)) {
    mkdir($submissions_dir, 0755, true);
}

// Create filename based on timestamp
$timestamp = date('Y-m-d_H-i-s');
$filename = $submissions_dir . '/' . $timestamp . '_' . md5($data['email']) . '.json';

// Ensure the file doesn't already exist (add microseconds if needed)
$counter = 0;
$base_filename = $filename;
while (file_exists($filename) && $counter < 100) {
    $counter++;
    $filename = substr($base_filename, 0, -5) . '_' . $counter . '.json';
}

// Prepare data to save
$submission = [
    'id' => uniqid('contact_'),
    'name' => sanitize_input($data['name']),
    'email' => sanitize_input($data['email']),
    'subject' => sanitize_input($data['subject']),
    'message' => sanitize_input($data['message']),
    'timestamp' => $data['timestamp'],
    'received_at' => date('Y-m-d H:i:s'),
    'user_agent' => sanitize_input($data['userAgent'] ?? ''),
    'ip_address' => get_client_ip()
];

// Save to JSON file
if (file_put_contents($filename, json_encode($submission, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES))) {
    // Also append to a master log file for easier reading
    $log_file = $submissions_dir . '/contact_log.jsonl';
    file_put_contents($log_file, json_encode($submission) . "\n", FILE_APPEND);
    
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'Contact form submitted successfully']);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save submission']);
}

/**
 * Sanitize user input
 */
function sanitize_input($input) {
    if (is_array($input)) {
        return array_map('sanitize_input', $input);
    }
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

/**
 * Get client IP address
 */
function get_client_ip() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        $ip = $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        // Handle multiple IPs (take the first one)
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($ips[0]);
    } else {
        $ip = $_SERVER['REMOTE_ADDR'];
    }
    
    // Validate IP address
    if (filter_var($ip, FILTER_VALIDATE_IP)) {
        return $ip;
    }
    return 'unknown';
}
?>
