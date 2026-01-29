<?php
/**
 * Open World Game - Phase 1 Setup Script
 * Executes database schema and verifies installation
 */

// Handle both CLI and web requests
$is_cli = php_sapi_name() === 'cli';
$is_post = isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST';

if (!$is_cli && !$is_post) {
    http_response_code(405);
    die('Method not allowed');
}

if (!$is_cli) {
    header('Content-Type: application/json');
}

function log_message($msg) {
    global $is_cli;
    if ($is_cli) {
        echo $msg . "\n";
    }
}

log_message("╔════════════════════════════════════════════════════════════════╗");
log_message("║         Open World Game - Phase 1 Setup                       ║");
log_message("╚════════════════════════════════════════════════════════════════╝\n");

// Step 1: Database Connection
log_message("Step 1: Connecting to database...");
$db = new mysqli('localhost', 'root', '', 'gamehappy');

if ($db->connect_error) {
    $error = "Connection failed: " . $db->connect_error;
    log_message("❌ " . $error);
    log_message("   Make sure MySQL is running in XAMPP");
    if (!$is_cli) {
        echo json_encode(['success' => false, 'message' => $error]);
    }
    exit(1);
}
log_message("✅ Connected to gamehappy database\n");

// Step 2: Read and execute schema
log_message("Step 2: Creating database tables...");
$schema = file_get_contents(__DIR__ . '/database-schema.sql');

if (!$schema) {
    log_message("❌ Could not read database-schema.sql");
    if (!$is_cli) {
        echo json_encode(['success' => false, 'message' => 'Could not read schema file']);
    }
    exit(1);
}

// Split by semicolons and execute each statement
$statements = array_filter(array_map('trim', explode(';', $schema)));
$created = 0;
$errors = [];

foreach ($statements as $statement) {
    if (empty($statement)) continue;
    if (strpos($statement, '--') === 0) continue; // Skip comments
    
    // Skip DROP statements for now
    if (strpos(strtoupper($statement), 'DROP') === 0) continue;
    
    if (!$db->query($statement)) {
        // Check if it's a "table already exists" error (that's OK)
        if (strpos($db->error, 'already exists') === false && strpos($db->error, 'Duplicate') === false) {
            $errors[] = $db->error;
        }
    }
}

log_message("✅ Database tables created/verified\n");

// Step 3: Verify tables exist
log_message("Step 3: Verifying tables...");
$tables = [
    'ow_worlds',
    'ow_places',
    'ow_place_exits',
    'ow_objects',
    'ow_mechanics',
    'ow_sub_areas',
    'ow_plot_assignments',
    'ow_permissions'
];

$missing = [];
foreach ($tables as $table) {
    $result = $db->query("SHOW TABLES LIKE '$table'");
    if ($result && $result->num_rows > 0) {
        log_message("  ✅ $table");
    } else {
        log_message("  ❌ $table (MISSING)");
        $missing[] = $table;
    }
}

if (!empty($missing)) {
    log_message("\n⚠️  Missing tables: " . implode(', ', $missing));
    log_message("   The schema may not have executed properly");
    if (!$is_cli) {
        echo json_encode(['success' => false, 'message' => 'Missing tables: ' . implode(', ', $missing)]);
    }
    exit(1);
}

log_message("\n✅ All tables verified!\n");

// Step 4: Check file structure
log_message("Step 4: Verifying application files...");
$files = [
    'admin.html',
    'admin.css',
    'admin.js',
    'api.php'
];

$missing_files = [];
$base_dir = __DIR__;
foreach ($files as $file) {
    $path = $base_dir . '/' . $file;
    if (file_exists($path)) {
        $size = filesize($path);
        log_message("  ✅ $file (" . $size . " bytes)");
    } else {
        log_message("  ❌ $file (MISSING)");
        $missing_files[] = $file;
    }
}

if (!empty($missing_files)) {
    log_message("\n⚠️  Missing files: " . implode(', ', $missing_files));
    if (!$is_cli) {
        echo json_encode(['success' => false, 'message' => 'Missing files: ' . implode(', ', $missing_files)]);
    }
    exit(1);
}

log_message("\n✅ All application files verified!\n");

// Step 5: Quick test
log_message("Step 5: Testing API connection...");
$test_ok = true;

// Check if we can insert and query
$test_world = 'Setup Test World ' . date('Y-m-d H:i:s');
$stmt = $db->prepare('INSERT INTO ow_worlds (name, description, created_by, is_public) VALUES (?, ?, ?, ?)');
$desc = 'Temporary test world - safe to delete';
$admin = 'setup_test';
$public = 0;

if ($stmt->bind_param('sssi', $test_world, $desc, $admin, $public) && $stmt->execute()) {
    log_message("  ✅ Database write test passed");
    
    // Query it back
    $query_stmt = $db->prepare('SELECT id FROM ow_worlds WHERE name = ?');
    $query_stmt->bind_param('s', $test_world);
    if ($query_stmt->execute() && $query_stmt->get_result()->num_rows > 0) {
        log_message("  ✅ Database read test passed");
        
        // Clean up
        $db->query("DELETE FROM ow_worlds WHERE name = '$test_world'");
        log_message("  ✅ Cleanup successful");
    } else {
        log_message("  ❌ Database read test failed");
        $test_ok = false;
    }
    $query_stmt->close();
} else {
    log_message("  ❌ Database write test failed: " . $stmt->error);
    $test_ok = false;
}
$stmt->close();

log_message("\n");

// Final Summary
if ($is_cli) {
    log_message("╔════════════════════════════════════════════════════════════════╗");
    if ($test_ok && empty($missing) && empty($missing_files)) {
        log_message("║  ✅ SETUP COMPLETE - READY TO USE!                           ║");
        log_message("╠════════════════════════════════════════════════════════════════╣");
        log_message("║  Next Steps:                                                  ║");
        log_message("║  1. Navigate to admin dashboard:                             ║");
        log_message("║     http://localhost/gamehappy/gamehappy.app/openworld/      ║");
        log_message("║     admin.html                                               ║");
        log_message("║                                                              ║");
        log_message("║  2. Login with: admin / admin123                             ║");
        log_message("║                                                              ║");
        log_message("║  3. Create your first world!                                 ║");
        log_message("╚════════════════════════════════════════════════════════════════╝");
    } else {
        log_message("║  ⚠️  SETUP INCOMPLETE                                         ║");
        log_message("║  Please review errors above                                  ║");
        log_message("╚════════════════════════════════════════════════════════════════╝");
        exit(1);
    }
} else {
    // JSON response for web request
    if ($test_ok && empty($missing) && empty($missing_files)) {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Setup complete!',
            'tables' => $tables,
            'files' => $files
        ]);
    } else {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'message' => 'Setup failed',
            'missing_tables' => $missing,
            'missing_files' => $missing_files,
            'errors' => $errors
        ]);
    }
}

$db->close();
?>
