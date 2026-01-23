<?php
/**
 * GameHappy Database Configuration
 * Handles all database connections and user data persistence
 */

class GameHappyDB {
    private $host = 'localhost';
    private $db = 'gamehappy';
    private $user = 'gamehappy';
    private $password = 'GameHappy2026';
    private $conn;

    public function connect() {
        // First, try to connect to MySQL without selecting a database
        $temp_conn = new mysqli($this->host, $this->user, $this->password);

        if ($temp_conn->connect_error) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Database connection failed: ' . $temp_conn->connect_error
            ]);
            exit;
        }

        // Create database if it doesn't exist
        if (!$temp_conn->query("CREATE DATABASE IF NOT EXISTS " . $this->db)) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Failed to create database: ' . $temp_conn->error
            ]);
            exit;
        }

        // Now select the database
        $this->conn = new mysqli(
            $this->host,
            $this->user,
            $this->password,
            $this->db
        );

        if ($this->conn->connect_error) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Failed to select database: ' . $this->conn->connect_error
            ]);
            exit;
        }

        $temp_conn->close();
        return $this->conn;
    }

    public function createTables() {
        try {
            $conn = $this->connect();

            // Users table
            $users_sql = "CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(20) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                is_active BOOLEAN DEFAULT TRUE
            )";

            // User Stats table
            $stats_sql = "CREATE TABLE IF NOT EXISTS user_stats (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                elo_rating INT DEFAULT 1600,
                friendly_chess_games INT DEFAULT 0,
                timed_chess_games INT DEFAULT 0,
                timed_chess_wins INT DEFAULT 0,
                timed_chess_losses INT DEFAULT 0,
                timed_chess_draws INT DEFAULT 0,
                world_chess_participations INT DEFAULT 0,
                wack_chess_games INT DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )";

            // Game Sessions table
            $sessions_sql = "CREATE TABLE IF NOT EXISTS game_sessions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                game_type VARCHAR(50) NOT NULL,
                opponent_id INT,
                result VARCHAR(20),
                moves_made INT DEFAULT 0,
                duration_seconds INT DEFAULT 0,
                elo_change INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )";

            if (!$conn->query($users_sql)) {
                error_log("Error creating users table: " . $conn->error);
            }

            if (!$conn->query($stats_sql)) {
                error_log("Error creating user_stats table: " . $conn->error);
            }

            if (!$conn->query($sessions_sql)) {
                error_log("Error creating game_sessions table: " . $conn->error);
            }

            $conn->close();
        } catch (Exception $e) {
            error_log("Database initialization error: " . $e->getMessage());
        }
    }

    public function query($sql) {
        $conn = $this->connect();
        $result = $conn->query($sql);
        $conn->close();
        return $result;
    }

    public function fetchOne($sql) {
        $conn = $this->connect();
        $result = $conn->query($sql);
        $row = $result->fetch_assoc();
        $conn->close();
        return $row;
    }

    public function fetchAll($sql) {
        $conn = $this->connect();
        $result = $conn->query($sql);
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
        $conn->close();
        return $rows;
    }

    public function execute($sql, $params = []) {
        $conn = $this->connect();
        $stmt = $conn->prepare($sql);
        
        if (count($params) > 0) {
            $types = str_repeat('s', count($params));
            $stmt->bind_param($types, ...$params);
        }
        
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();
        $conn->close();
        
        return $result;
    }

    public function getLastInsertId() {
        $conn = $this->connect();
        $id = $conn->insert_id;
        $conn->close();
        return $id;
    }
}

?>
