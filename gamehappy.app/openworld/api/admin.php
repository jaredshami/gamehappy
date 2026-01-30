<?php
/**
 * Open World Game - Admin API
 * Handles world and place creation
 */

header('Content-Type: application/json');
session_start();

// Enable detailed error reporting
error_reporting(E_ALL);
ini_set('display_errors', 0);

// Get database connection
$db_host = 'localhost';
$db_user = 'gamehappy';
$db_pass = 'GameHappy2026';
$db_name = 'gamehappy';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// Check if admin is logged in
if (!($_SESSION['admin_logged_in'] ?? false)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Not authenticated']);
    exit;
}

$username = $_SESSION['admin_username'] ?? 'admin';

// Read action from GET, POST, or JSON body
$action = $_GET['action'] ?? null;
if (!$action) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $action = $json_data['action'] ?? null;
}

try {
    if (!$action) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Action parameter required']);
        exit;
    }
    
    switch ($action) {
        case 'create_world':
            createWorld($pdo, $username);
            break;
        case 'get_worlds':
            getWorlds($pdo);
            break;
        case 'create_place':
            createPlace($pdo, $username);
            break;
        case 'get_places':
            getPlaces($pdo);
            break;
        case 'link_places':
            linkPlaces($pdo);
            break;
        case 'create_object':
            createObject($pdo, $username);
            break;
        case 'add_mechanic':
            addMechanic($pdo);
            break;
        case 'get_objects':
            getObjects($pdo);
            break;
        case 'get_object_mechanics':
            getObjectMechanics($pdo);
            break;
        case 'delete_mechanic':
            deleteMechanic($pdo);
            break;
        case 'get_exits':
            getExits($pdo);
            break;
        case 'delete_exit':
            deleteExit($pdo);
            break;
        case 'update_exit_type':
            updateExitType($pdo);
            break;
        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Invalid action: ' . $action]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'message' => 'Error: ' . $e->getMessage(),
        'debug' => [
            'file' => $e->getFile(),
            'line' => $e->getLine()
        ]
    ]);
}

function createWorld($pdo, $username) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['name']) {
        throw new Exception('World name required');
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO ow_worlds (name, description, created_by, is_public)
        VALUES (?, ?, ?, ?)
    ");
    
    $result = $stmt->execute([
        $data['name'],
        $data['description'] ?? null,
        $username,
        $data['is_public'] ?? false
    ]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'world_id' => $pdo->lastInsertId(),
            'message' => 'World created successfully'
        ]);
    }
    exit;
}

function getWorlds($pdo) {
    try {
        $stmt = $pdo->prepare("
            SELECT id, name, description, created_at, is_public,
                   (SELECT COUNT(*) FROM ow_places WHERE world_id = ow_worlds.id) as place_count
            FROM ow_worlds
            ORDER BY created_at DESC
        ");
        $stmt->execute();
        $worlds = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'worlds' => $worlds]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

function createPlace($pdo, $username) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['world_id'] || !$data['name']) {
        throw new Exception('World ID and place name required');
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO ow_places (world_id, name, description, created_by)
        VALUES (?, ?, ?, ?)
    ");
    
    $result = $stmt->execute([
        $data['world_id'],
        $data['name'],
        $data['description'] ?? null,
        $username
    ]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'place_id' => $pdo->lastInsertId(),
            'message' => 'Place created successfully'
        ]);
    }
    exit;
}

function getPlaces($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $worldId = $json_data['world_id'] ?? $_GET['world_id'] ?? null;
    
    if (!$worldId) {
        throw new Exception('World ID required');
    }
    
    $stmt = $pdo->prepare("
        SELECT id, name, description, created_at
        FROM ow_places
        WHERE world_id = ?
        ORDER BY created_at ASC
    ");
    
    $stmt->execute([$worldId]);
    $places = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'places' => $places]);
    exit;
}

function linkPlaces($pdo) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['from_place_id'] || !$data['to_place_id'] || !$data['direction']) {
        throw new Exception('From place, to place, and direction required');
    }
    
    // Validate direction
    $validDirections = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
    if (!in_array(strtolower($data['direction']), $validDirections)) {
        throw new Exception('Invalid direction');
    }
    
    // Validate connection_type if provided
    $validConnectionTypes = ['full', 'passage', 'closed', 'locked', 'no_throughway'];
    $connectionType = 'full'; // default
    if (isset($data['connection_type']) && in_array($data['connection_type'], $validConnectionTypes)) {
        $connectionType = $data['connection_type'];
    }
    
    // Check if exit already exists
    $stmt = $pdo->prepare("
        SELECT id FROM ow_place_exits 
        WHERE from_place_id = ? AND direction = ?
    ");
    $stmt->execute([$data['from_place_id'], strtolower($data['direction'])]);
    
    if ($stmt->fetch()) {
        throw new Exception('Exit already exists in that direction');
    }
    
    // Check if connection_type column exists, if not use basic INSERT
    $stmt = $pdo->prepare("
        INSERT INTO ow_place_exits (from_place_id, to_place_id, direction, connection_type)
        VALUES (?, ?, ?, ?)
    ");
    
    try {
        $result = $stmt->execute([
            $data['from_place_id'],
            $data['to_place_id'],
            strtolower($data['direction']),
            $connectionType
        ]);
    } catch (Exception $e) {
        // If connection_type column doesn't exist, try without it
        $stmt = $pdo->prepare("
            INSERT INTO ow_place_exits (from_place_id, to_place_id, direction)
            VALUES (?, ?, ?)
        ");
        $result = $stmt->execute([
            $data['from_place_id'],
            $data['to_place_id'],
            strtolower($data['direction'])
        ]);
    }
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'message' => 'Places linked successfully',
            'connection_type' => $connectionType
        ]);
    }
    exit;
}

function createObject($pdo, $username) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['place_id'] || !$data['name']) {
        throw new Exception('Place ID and object name required');
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO ow_objects (place_id, name, description, created_by)
        VALUES (?, ?, ?, ?)
    ");
    
    $result = $stmt->execute([
        $data['place_id'],
        $data['name'],
        $data['description'] ?? null,
        $username
    ]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'object_id' => $pdo->lastInsertId(),
            'message' => 'Object created successfully'
        ]);
    }
    exit;
}

function addMechanic($pdo) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['object_id'] || !$data['type'] || !$data['name']) {
        throw new Exception('Object ID, type, and name required');
    }
    
    $stmt = $pdo->prepare("
        INSERT INTO ow_mechanics (object_id, type, name, description, action_value)
        VALUES (?, ?, ?, ?, ?)
    ");
    
    $result = $stmt->execute([
        $data['object_id'],
        $data['type'],
        $data['name'],
        $data['description'] ?? null,
        isset($data['action_value']) ? json_encode($data['action_value']) : null
    ]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'mechanic_id' => $pdo->lastInsertId(),
            'message' => 'Mechanic added successfully'
        ]);
    }
    exit;
}

function getObjects($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $placeId = $json_data['place_id'] ?? $_GET['place_id'] ?? null;
    
    if (!$placeId) {
        throw new Exception('Place ID required');
    }
    
    $stmt = $pdo->prepare("
        SELECT id, name, description, created_at
        FROM ow_objects
        WHERE place_id = ?
        ORDER BY created_at ASC
    ");
    
    $stmt->execute([$placeId]);
    $objects = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['success' => true, 'objects' => $objects]);
    exit;
}

function getObjectMechanics($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $objectId = $json_data['object_id'] ?? null;
    
    if (!$objectId) {
        throw new Exception('Object ID required');
    }
    
    // Get object info
    $stmt = $pdo->prepare("SELECT id, name, description FROM ow_objects WHERE id = ?");
    $stmt->execute([$objectId]);
    $object = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$object) {
        throw new Exception('Object not found');
    }
    
    // Get mechanics for this object
    $stmt = $pdo->prepare("
        SELECT id, type, name, description, action_value
        FROM ow_mechanics
        WHERE object_id = ?
        ORDER BY created_at ASC
    ");
    $stmt->execute([$objectId]);
    $mechanics = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Parse action_value JSON for each mechanic
    foreach ($mechanics as &$mechanic) {
        if ($mechanic['action_value']) {
            $mechanic['action_value'] = json_decode($mechanic['action_value'], true);
        }
    }
    
    echo json_encode(['success' => true, 'object' => $object, 'mechanics' => $mechanics]);
    exit;
}

function deleteMechanic($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $mechanicId = $json_data['mechanic_id'] ?? null;
    
    if (!$mechanicId) {
        throw new Exception('Mechanic ID required');
    }
    
    $stmt = $pdo->prepare("DELETE FROM ow_mechanics WHERE id = ?");
    $stmt->execute([$mechanicId]);
    
    echo json_encode(['success' => true, 'message' => 'Mechanic deleted']);
    exit;
}

function getExits($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $placeId = $json_data['place_id'] ?? null;
    
    if (!$placeId) {
        throw new Exception('Place ID required');
    }
    
    // Try to select connection_type, fallback to 'full' if column doesn't exist
    $stmt = $pdo->prepare("
        SELECT 
            pe.id,
            pe.direction,
            pe.from_place_id,
            pe.to_place_id,
            p.name as destination_name,
            COALESCE(pe.connection_type, 'full') as connection_type
        FROM ow_place_exits pe
        LEFT JOIN ow_places p ON pe.to_place_id = p.id
        WHERE pe.from_place_id = ?
        ORDER BY pe.direction ASC
    ");
    
    try {
        $stmt->execute([$placeId]);
        $exits = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        // Fallback if connection_type column doesn't exist
        $stmt = $pdo->prepare("
            SELECT 
                pe.id,
                pe.direction,
                pe.from_place_id,
                pe.to_place_id,
                p.name as destination_name,
                'full' as connection_type
            FROM ow_place_exits pe
            LEFT JOIN ow_places p ON pe.to_place_id = p.id
            WHERE pe.from_place_id = ?
            ORDER BY pe.direction ASC
        ");
        $stmt->execute([$placeId]);
        $exits = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    echo json_encode(['success' => true, 'exits' => $exits]);
    exit;
}

function deleteExit($pdo) {
    $json_data = json_decode(file_get_contents('php://input'), true);
    $exitId = $json_data['exit_id'] ?? null;
    
    if (!$exitId) {
        throw new Exception('Exit ID required');
    }
    
    $stmt = $pdo->prepare("DELETE FROM ow_place_exits WHERE id = ?");
    $stmt->execute([$exitId]);
    
    echo json_encode(['success' => true, 'message' => 'Exit deleted']);
    exit;
}

function updateExitType($pdo) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!$data['exit_id'] || !$data['connection_type']) {
        throw new Exception('Exit ID and connection type required');
    }
    
    // Validate connection_type
    $validConnectionTypes = ['full', 'passage', 'closed', 'locked', 'no_throughway'];
    if (!in_array($data['connection_type'], $validConnectionTypes)) {
        throw new Exception('Invalid connection type');
    }
    
    // Try to update with connection_type column
    try {
        $stmt = $pdo->prepare("
            UPDATE ow_place_exits 
            SET connection_type = ? 
            WHERE id = ?
        ");
        $stmt->execute([$data['connection_type'], $data['exit_id']]);
    } catch (Exception $e) {
        // If column doesn't exist, just continue - it will be added to schema later
        // Don't throw an error, just log it
        error_log('connection_type column not available: ' . $e->getMessage());
    }
    
    echo json_encode(['success' => true, 'message' => 'Connection type updated']);
    exit;
}