<?php
// Save contact form submissions to JSON file
// This script handles form data (POST from HTML form)

// Set JSON response header
header('Content-Type: application/json');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get form data from POST
$name = isset($_POST['name']) ? trim($_POST['name']) : '';
$email = isset($_POST['email']) ? trim($_POST['email']) : '';
$subject = isset($_POST['subject']) ? trim($_POST['subject']) : '';
$message = isset($_POST['message']) ? trim($_POST['message']) : '';

// Validate required fields
if (empty($name)) {
    http_response_code(400);
    echo json_encode(['error' => 'Name is required']);
    exit;
}

if (empty($email)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email is required']);
    exit;
}

if (empty($subject)) {
    http_response_code(400);
    echo json_encode(['error' => 'Subject is required']);
    exit;
}

if (empty($message)) {
    http_response_code(400);
    echo json_encode(['error' => 'Message is required']);
    exit;
}

// Validate email format
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid email format']);
    exit;
}

// Sanitize inputs
$name = sanitize_input($name);
$email = sanitize_input($email);
$subject = sanitize_input($subject);
$message = sanitize_input($message);

// Directory to store contact submissions
$submissions_dir = __DIR__ . '/data/contact-submissions';

// Create directory if it doesn't exist
if (!is_dir($submissions_dir)) {
    if (!@mkdir($submissions_dir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create submissions directory']);
        exit;
    }
}

// Check if directory is writable
if (!is_writable($submissions_dir)) {
    @chmod($submissions_dir, 0755);
    if (!is_writable($submissions_dir)) {
        http_response_code(500);
        echo json_encode(['error' => 'Submissions directory is not writable']);
        exit;
    }
}

// Create filename based on timestamp with microseconds for uniqueness
$timestamp = date('Y-m-d_H-i-s');
$microseconds = str_pad((microtime(true) * 1000000) % 1000000, 6, '0', STR_PAD_LEFT);
$email_hash = md5(strtolower($email));
$filename = $submissions_dir . '/' . $timestamp . '_' . $microseconds . '_' . $email_hash . '.json';

// Prepare data to save
$submission = [
    'id' => uniqid('contact_'),
    'name' => $name,
    'email' => $email,
    'subject' => $subject,
    'message' => $message,
    'received_at' => date('Y-m-d H:i:s'),
    'user_agent' => sanitize_input($_SERVER['HTTP_USER_AGENT'] ?? ''),
    'ip_address' => get_client_ip(),
    'timestamp' => date('c') // ISO 8601 format
];

// Save to JSON file
$json_content = json_encode($submission, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if ($json_content === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to encode submission data']);
    exit;
}

$bytes_written = @file_put_contents($filename, $json_content);
if ($bytes_written === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save submission']);
    exit;
}

// Also append to a master log file for easier reading
$log_file = $submissions_dir . '/contact_log.jsonl';
$log_entry = json_encode($submission) . "\n";
@file_put_contents($log_file, $log_entry, FILE_APPEND | LOCK_EX);

// Return success
http_response_code(200);
echo json_encode([
    'success' => true,
    'message' => 'Thank you for your message! We have received your contact information and will respond shortly.',
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
    $input = trim($input);
    $input = strip_tags($input);
    $input = htmlspecialchars($input, ENT_QUOTES, 'UTF-8');
    return $input;
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
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }
    
    // Validate IP address
    if (!empty($ip) && filter_var($ip, FILTER_VALIDATE_IP)) {
        return $ip;
    }
    return 'unknown';
}
?>
