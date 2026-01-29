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
    $worldId = $_GET['world_id'] ?? null;
    
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
    $validDirections = ['north', 'south', 'east', 'west', 'up', 'down'];
    if (!in_array(strtolower($data['direction']), $validDirections)) {
        throw new Exception('Invalid direction');
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
    
    $stmt = $pdo->prepare("
        INSERT INTO ow_place_exits (from_place_id, to_place_id, direction)
        VALUES (?, ?, ?)
    ");
    
    $result = $stmt->execute([
        $data['from_place_id'],
        $data['to_place_id'],
        strtolower($data['direction'])
    ]);
    
    if ($result) {
        echo json_encode([
            'success' => true,
            'message' => 'Places linked successfully'
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
    $placeId = $_GET['place_id'] ?? null;
    
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