# GameHappy Authentication System

Complete user authentication and profile management system for GameHappy platform.

## 🔐 Features

### User Management
- ✅ User registration with validation
- ✅ Secure password hashing (bcrypt)
- ✅ User login with session management
- ✅ Remember-me functionality (30-day cookies)
- ✅ Session persistence check
- ✅ Logout with cleanup

### Player Statistics
- ✅ ELO rating tracking
- ✅ Game history per game type
- ✅ Win/loss/draw statistics
- ✅ Account creation timestamp
- ✅ Last login tracking

### Database Schema
```sql
-- Users Table
users (
  id INT PRIMARY KEY,
  username VARCHAR(20) UNIQUE,
  email VARCHAR(100) UNIQUE,
  password_hash VARCHAR(255),
  created_at TIMESTAMP,
  last_login TIMESTAMP,
  is_active BOOLEAN
)

-- User Stats Table
user_stats (
  id INT PRIMARY KEY,
  user_id INT FOREIGN KEY,
  elo_rating INT DEFAULT 1600,
  friendly_chess_games INT,
  timed_chess_games INT,
  timed_chess_wins INT,
  timed_chess_losses INT,
  timed_chess_draws INT,
  world_chess_participations INT,
  wack_chess_games INT,
  updated_at TIMESTAMP
)

-- Game Sessions Table
game_sessions (
  id INT PRIMARY KEY,
  user_id INT FOREIGN KEY,
  game_type VARCHAR(50),
  opponent_id INT,
  result VARCHAR(20),
  moves_made INT,
  duration_seconds INT,
  elo_change INT,
  created_at TIMESTAMP
)
```

---

## 🌐 API Endpoints

### Registration
**POST** `/api/auth/register.php`

Request:
```json
{
  "username": "gameplayer",
  "email": "player@example.com",
  "password": "securePassword123"
}
```

Response:
```json
{
  "success": true,
  "message": "Account created successfully",
  "userId": 123
}
```

Validation Rules:
- Username: 3-20 alphanumeric characters
- Email: Valid email format
- Password: Minimum 8 characters

---

### Login
**POST** `/api/auth/login.php`

Request:
```json
{
  "username": "gameplayer",
  "password": "securePassword123",
  "remember": true
}
```

Response:
```json
{
  "success": true,
  "userId": 123,
  "username": "gameplayer",
  "email": "player@example.com"
}
```

Features:
- Accept username or email
- Sessions stored server-side
- Optional remember-me (30 days)

---

### Session Check
**GET** `/api/auth/check-session.php`

Response (Logged In):
```json
{
  "loggedIn": true,
  "userId": 123,
  "username": "gameplayer",
  "email": "player@example.com"
}
```

Response (Not Logged In):
```json
{
  "loggedIn": false
}
```

---

### User Profile
**GET** `/api/auth/profile.php`

Response:
```json
{
  "success": true,
  "user": {
    "id": 123,
    "username": "gameplayer",
    "email": "player@example.com",
    "created_at": "2026-01-23 10:30:00",
    "elo_rating": 1650,
    "timed_chess_games": 15,
    "timed_chess_wins": 10,
    "timed_chess_losses": 4,
    "timed_chess_draws": 1
  }
}
```

---

### Update Profile/Stats
**PUT** `/api/auth/profile.php`

Request (Update ELO):
```json
{
  "elo_rating": 1675
}
```

Request (Record Game Result):
```json
{
  "game_type": "timed_chess",
  "result": "win"
}
```

Response:
```json
{
  "success": true,
  "message": "Stats updated"
}
```

---

### Logout
**GET/POST** `/api/auth/logout.php`

Response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

Actions:
- Destroys session
- Clears cookies
- Clears all stored tokens

---

## 🎨 Frontend Components

### Signup Page
**File:** `auth/signup.html`

Features:
- Real-time validation
- Password confirmation
- Terms agreement checkbox
- Error messaging
- Form submission feedback

### Login Page
**File:** `auth/login.html`

Features:
- Username/email input
- Remember me checkbox
- Password field
- Forgot password link (placeholder)
- Error messaging

### Styles
**File:** `auth/auth.css`

- Responsive design (mobile-first)
- Gradient background
- Clean form layout
- Loading states
- Error/success messages

---

## 🔗 Integration with Games

### GameHappyAuth Class
**File:** `ultimatechess/js/auth.js`

Main methods:
```javascript
class GameHappyAuth {
    checkSession()              // Verify user is logged in
    onSessionValid()            // Called when session validated
    redirectToLogin()           // Redirect to login page
    logout()                    // Log user out
    updateUserStats(gameType, result, eloChange)  // Record game result
    getUserProfile()            // Fetch user profile and stats
}
```

### Usage Example (Timed Chess)
```javascript
class TimedChessAuth extends GameHappyAuth {
    onSessionValid() {
        game = new TimedChessGame(this);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const auth = new TimedChessAuth();
});
```

### Recording Game Results
```javascript
// After game ends
this.auth.updateUserStats('timed_chess', 'win').then(data => {
    console.log('Stats recorded');
});
```

---

## 🔐 Security Features

### Password Security
- Bcrypt hashing (cost factor 10)
- No plain text storage
- Password validation (8+ characters)

### Session Management
- Server-side sessions
- Session token regeneration
- Automatic timeout
- CSRF protection ready

### SQL Protection
- Prepared statements
- Parameter binding
- Input sanitization

### Cookie Security
- HttpOnly flags (configurable)
- Secure flag (set in production)
- SameSite policy (set in production)

---

## 🚀 Installation & Setup

### 1. Database Creation
```bash
# MySQL will auto-create on first request via Database.php
# Or manually run:
mysql -u root
CREATE DATABASE gamehappy;
USE gamehappy;
```

### 2. Configuration
Edit `api/auth/Database.php`:
```php
$host = 'localhost';
$db = 'gamehappy';
$user = 'root';
$password = ''; // Set your password
```

### 3. File Permissions
```bash
chmod 755 api/auth/
chmod 644 api/auth/*.php
```

### 4. Test Registration
Navigate to `auth/signup.html` and create account

### 5. Test Login
Navigate to `auth/login.html` and sign in

---

## 📋 User Registration Flow

```
1. User visits signup.html
2. Fills form (username, email, password)
3. JavaScript validates client-side
4. POST to /api/auth/register.php
5. Server validates and hashes password
6. Creates user record in database
7. Creates user_stats record
8. Returns success
9. Redirects to login.html
```

---

## 📋 User Login Flow

```
1. User visits login.html
2. Enters username/email and password
3. POST to /api/auth/login.php
4. Server verifies credentials
5. Creates PHP session
6. Sets cookies if "remember me" checked
7. Returns userId, username, email
8. JavaScript stores in sessionStorage
9. Redirects to ultimatechess/index.html
```

---

## 🎮 Game Integration Flow

### Before Game Starts
```javascript
// Game checks authentication
const auth = new GameHappyAuth();
// If not logged in, redirects to login page
// If logged in, loads game
```

### During Gameplay
```javascript
// Game instance receives auth object
class MyGame {
    constructor(auth) {
        this.auth = auth;
        this.userId = auth.userId;
        this.userName = auth.username;
    }
}
```

### After Game Ends
```javascript
// Record result
this.auth.updateUserStats('timed_chess', 'win', eloChange);
// Stats saved to database
// Next game shows updated ELO
```

---

## 📊 Statistics Tracking

### Timed Chess
- `timed_chess_games` - Total games played
- `timed_chess_wins` - Number of wins
- `timed_chess_losses` - Number of losses
- `timed_chess_draws` - Number of draws
- `elo_rating` - Current ELO rating

### Friendly Chess
- `friendly_chess_games` - Total games played

### World Chess
- `world_chess_participations` - Team participations

### Wack-a-Chess
- `wack_chess_games` - Total games played

---

## 🛠 Troubleshooting

### Database Connection Error
- Check MySQL is running
- Verify credentials in Database.php
- Check database exists

### Registration Fails
- Check username is unique
- Check email is valid
- Check password is 8+ characters

### Session Not Persisting
- Check PHP sessions folder permissions
- Verify session_start() called
- Check browser accepts cookies

### ELO Not Updating
- Verify user is logged in
- Check API endpoint returns success
- Check database has user_stats record

---

## 🔒 Production Checklist

- [ ] Set secure cookie flags in login.php
- [ ] Add HTTPS requirement
- [ ] Add rate limiting to login/register
- [ ] Add email verification
- [ ] Add password reset functionality
- [ ] Set up 2FA
- [ ] Configure CORS properly
- [ ] Add audit logging
- [ ] Set up database backups
- [ ] Configure firewall rules

---

## 📞 API Status Codes

- `200` - Success
- `400` - Bad request (validation failed)
- `401` - Unauthorized (invalid credentials)
- `405` - Method not allowed
- `409` - Conflict (username/email exists)
- `500` - Server error

---

## 📄 Files Included

```
auth/
├── signup.html          # Registration form
├── login.html           # Login form
├── signup.js            # Registration logic
├── login.js             # Login logic
└── auth.css             # Auth styles

api/auth/
├── Database.php         # Database management
├── register.php         # Registration endpoint
├── login.php            # Login endpoint
├── check-session.php    # Session verification
├── profile.php          # Profile and stats
└── logout.php           # Logout endpoint

ultimatechess/js/
└── auth.js              # Auth manager class
```

---

**Last Updated:** January 23, 2026  
**Version:** 1.0.0
