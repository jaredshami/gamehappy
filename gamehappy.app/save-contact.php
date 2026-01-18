<?php
// Save contact form submissions to JSON file
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', 0); // Don't display errors directly, log them instead

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get JSON data from request
$json = file_get_contents('php://input');
if (empty($json)) {
    http_response_code(400);
    echo json_encode(['error' => 'No data provided']);
    exit;
}

$data = json_decode($json, true);
if ($data === null) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON format']);
    exit;
}

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
    if (!mkdir($submissions_dir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create submissions directory']);
        exit;
    }
}

// Check if directory is writable
if (!is_writable($submissions_dir)) {
    chmod($submissions_dir, 0755);
    if (!is_writable($submissions_dir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Submissions directory is not writable']);
        exit;
    }
}

// Create filename based on timestamp with microseconds for uniqueness
$timestamp = date('Y-m-d_H-i-s');
$microseconds = str_pad(microtime(true) * 1000000 % 1000000, 6, '0', STR_PAD_LEFT);
$filename = $submissions_dir . '/' . $timestamp . '_' . $microseconds . '_' . md5($data['email']) . '.json';

// Prepare data to save
$submission = [
    'id' => uniqid('contact_'),
    'name' => sanitize_input($data['name']),
    'email' => sanitize_input($data['email']),
    'subject' => sanitize_input($data['subject']),
    'message' => sanitize_input($data['message']),
    'timestamp' => $data['timestamp'] ?? null,
    'received_at' => date('Y-m-d H:i:s'),
    'user_agent' => sanitize_input($data['userAgent'] ?? ''),
    'ip_address' => get_client_ip()
];

// Save to JSON file
$json_content = json_encode($submission, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if ($json_content === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to encode submission data']);
    exit;
}

$bytes_written = file_put_contents($filename, $json_content);
if ($bytes_written === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save submission to file']);
    exit;
}

// Also append to a master log file for easier reading
$log_file = $submissions_dir . '/contact_log.jsonl';
$log_entry = json_encode($submission) . "\n";
$log_result = file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX);

// Return success regardless of log file result (log file is optional)
http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => 'Contact form submitted successfully',
    'id' => $submission['id']
]);
exit;

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
