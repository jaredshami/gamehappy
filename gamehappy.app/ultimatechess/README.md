# 🎮 Ultimate Chess - Complete Game Suite

A sophisticated multi-variant chess platform featuring four distinct game modes with real-time multiplayer capabilities.

## 📋 Game Variants

### 1. **Friendly Chess** ♟️
Casual, untimed chess for relaxing gameplay.

**Features:**
- ✅ Random opponent matchmaking
- ✅ Friend code system (6-character codes)
- ✅ Nudge system with 30-second forfeit timeout
- ✅ No time pressure
- ✅ Unlimited game sessions

**How to Play:**
1. Create game or find random opponent
2. Invite friends using 6-character code
3. If someone takes too long, nudge them
4. If they don't respond in 30 seconds, they forfeit
5. Play until checkmate or draw

**File Structure:**
```
gamehappy.app/ultimatechess/games/
├── friendly-chess.html
├── friendly-chess.css
└── friendly-chess.js
```

---

### 2. **Timed Chess** ⏱️
Competitive chess with ELO rating system.

**Features:**
- ✅ Time controls: 1, 3, 5, 10 minutes per side
- ✅ Dynamic ELO rating system
- ✅ K-factor varies by time control (32, 24, 16, 8)
- ✅ Player statistics tracking
- ✅ Leaderboard ready
- ✅ localStorage persistence

**ELO Calculations:**
```
K-Factor by Time Control:
- 1 min (Bullet): K=32 (±32 ELO per game)
- 3 min (Rapid): K=24 (±24 ELO per game)
- 5 min (Blitz): K=16 (±16 ELO per game)
- 10 min (Classical): K=8 (±8 ELO per game)
```

**Stored Data:**
```javascript
localStorage.timedChessStats: {
  rating: 1600,      // Current ELO
  gamesPlayed: 25,
  wins: 15,
  losses: 8,
  draws: 2
}
```

**File Structure:**
```
gamehappy.app/ultimatechess/games/
├── timed-chess.html
├── timed-chess.css
└── timed-chess.js
```

---

### 3. **World Chess** 🌍
Massive multiplayer with team-based voting on moves.

**Features:**
- ✅ Four simultaneous game tiers:
  - ⚡ 3-second per move
  - 🔥 10-second per move
  - ⏳ 1-minute per move
  - 🌙 1-hour per move
- ✅ 50-300+ concurrent players per game
- ✅ Teams vote on each move
- ✅ Majority vote determines move
- ✅ Real-time voting display
- ✅ Continuous game cycling (1-min break between games)

**How Voting Works:**
1. White team players all cast votes for what to move
2. Timer counts down (3s, 10s, 1min, or 1hr)
3. Regardless of votes cast, highest-voted move executes
4. Then Black team does the same
5. Continue until checkmate

**Player Assignment:**
- Joins as White or Black (alternating)
- Can join at any time, even mid-game
- Stats track individual vote accuracy

**File Structure:**
```
gamehappy.app/ultimatechess/games/
├── world-chess.html
├── world-chess.css
└── world-chess.js
```

---

### 4. **Wack-a-Chess** 🔨
Chaotic 3-player variant with elimination mechanic.

**Features:**
- ✅ 3 players: White, Black, Wacker
- ✅ Friend codes for private games
- ✅ Piece elimination mechanic
- ✅ Three win conditions
- ✅ Wacker accuracy tracking

**Win Conditions:**
1. **Chess Players Win:** Checkmate opponent (standard chess rules)
2. **Wacker Wins:** Eliminate both queens (one from each side)

**How Wacker Works:**
- Each turn, after a move is made, wacker guesses the destination square
- If correct: piece is eliminated (marked with 💨)
- If wrong: game continues
- Wacker can guess any square (pieces move there, not where they came from)

**Roles:**
- **White & Black:** Play normal chess, unaware of wacker's moves
- **Wacker:** Views board, guesses move destinations
- All three can see the full board state

**File Structure:**
```
gamehappy.app/ultimatechess/games/
├── wack-chess.html
├── wack-chess.css
└── wack-chess.js
```

---

## 🏗️ Architecture

### Frontend Structure
```
gamehappy.app/ultimatechess/
├── index.html                          # Main menu
├── css/
│   └── style.css                       # Global + menu styles
├── js/
│   ├── chess-engine.js                 # Shared chess logic
│   └── menu.js                         # Menu navigation
└── games/
    ├── friendly-chess.html/.css/.js
    ├── timed-chess.html/.css/.js
    ├── world-chess.html/.css/.js
    └── wack-chess.html/.css/.js
```

### Shared Chess Engine
**File:** `js/chess-engine.js`

Implements complete chess logic:
- 8x8 board initialization
- All piece movement rules (pawn, rook, knight, bishop, queen, king)
- Special moves (castling, en passant - expandable)
- Path validation (no jumping over pieces)
- Check/checkmate/stalemate detection
- Move history tracking
- Board serialization (JSON)

**Key Methods:**
```javascript
new ChessBoard()
  .isValidMove(from, to, color)
  .makeMove(from, to)
  .isInCheck(color)
  .isCheckmate(color)
  .isStalemate(color)
  .getGameStatus()
  .getBoard()
  .resetBoard()
```

---

## 🎨 UI/UX Features

### Color Scheme
- **Primary:** `#667eea` (blue-purple)
- **Secondary:** `#764ba2` (purple)
- **Light:** `#F0D9B5` (chessboard light)
- **Dark:** `#B58863` (chessboard dark)

### Responsive Design
- Desktop-first approach
- Mobile breakpoints at 768px
- Flex/Grid layouts throughout
- Touch-friendly button sizes

### Interactive Elements
- **Board Squares:** Click to select piece, click destination to move
- **Timers:** Color changes based on urgency (green → yellow → red)
- **Live Updates:** Real-time piece movement and game status
- **Animations:** Smooth transitions and fade-ins

---

## 💾 Data Persistence

### LocalStorage Keys
```javascript
// Timed Chess
localStorage.timedChessStats = {
  rating: 1600,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0
}

localStorage.timedChessHistory = [
  { gameId, opponent, result, ratingChange, date }
]

// Friendly Chess
localStorage.userId = "friendly_xxx"

// World Chess
// Stats tracked per session only

// Wack-a-Chess  
// Stats tracked per session only
```

---

## 🚀 Deployment & WebSocket Integration

### Current Status
- All games fully playable in browser
- Simulated opponents and matchmaking
- Ready for WebSocket server integration

### Next Steps for Production

#### 1. WebSocket Server Setup
Location: `websocket/games/ultimatechess/`

Create game servers:
- `FriendlyChessServer.js` - Matchmaking & friend codes
- `TimedChessServer.js` - ELO tracking & persistence
- `WorldChessServer.js` - Team voting aggregation
- `WackAChessServer.js` - 3-player sync

#### 2. Backend Services Needed
```javascript
// Database requirements
Players {
  id, username, password_hash, email,
  elo_rating, games_played, wins, losses, draws,
  created_at, last_login
}

GameSessions {
  id, game_type, player_ids[], status,
  start_time, end_time, moves[], winner
}

FriendCodes {
  code, creator_id, created_at, expires_at,
  joined_players[]
}
```

#### 3. API Endpoints
```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/session

POST   /api/friendly-chess/create-game
POST   /api/friendly-chess/join-game
GET    /api/friendly-chess/game/:gameId

GET    /api/timed-chess/ranked-queue
POST   /api/timed-chess/submit-move
GET    /api/player/stats

GET    /api/world-chess/active-games
GET    /api/world-chess/game/:gameId/votes

POST   /api/wack-chess/create-game
GET    /api/wack-chess/join/:code
```

---

## 🧪 Testing Scenarios

### Friendly Chess
- [ ] Random opponent matching
- [ ] Friend code generation & joining
- [ ] Nudge functionality & 30-second timeout
- [ ] Resign game
- [ ] Offer draw

### Timed Chess
- [ ] All 4 time controls selectable
- [ ] ELO calculations correct (win/loss/draw)
- [ ] Rating updates persist in localStorage
- [ ] Stats display accurate

### World Chess
- [ ] Join any of 4 time tiers
- [ ] Voting interface responsive
- [ ] Top votes display updates
- [ ] Majority vote executes correctly
- [ ] Game cycles properly

### Wack-a-Chess
- [ ] 3-player role assignment
- [ ] Friend code system
- [ ] Piece elimination on correct guess
- [ ] Queen elimination triggers wacker win
- [ ] Checkmate triggers chess player win

---

## 📱 Supported Browsers

- Chrome/Edge 88+
- Firefox 86+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## 🎯 Future Enhancements

1. **Chess Variations:**
   - Castling rights validation
   - En passant capture
   - Pawn promotion UI
   - Three-fold repetition (draw)
   - 50-move rule

2. **Game Features:**
   - Game playback/replay
   - Chat functionality
   - Spectator mode
   - Handicap games
   - Custom time controls

3. **Social Features:**
   - Player profiles
   - Friends list
   - Achievement badges
   - Tournaments
   - Clans/Teams

4. **Analytics:**
   - Opening books
   - Move analysis
   - Performance graphs
   - Opponent analysis

5. **Monetization:**
   - Premium skins/themes
   - Cosmetic pieces
   - Ad-free mode
   - Premium tournaments

---

## 📞 Support & Debugging

### Common Issues

**Timer not updating?**
- Check browser console for JavaScript errors
- Verify setInterval is clearing properly
- Check that animation frames aren't blocking

**Board not rendering?**
- Verify ChessBoard class is loaded
- Check board element ID in DOM
- Inspect CSS grid layout

**ELO not saving?**
- Enable localStorage in browser
- Check localStorage.timedChessStats key exists
- Verify JSON serialization

### Debug Mode
Add to any game file:
```javascript
window.DEBUG = true;
```

---

## 📄 License

Part of GameHappy Platform © 2026

---

## 🎓 Credits

**Chess Engine:** Custom implementation
**UI Framework:** Vanilla HTML/CSS/JavaScript
**Architecture:** GameHappy Team

---

**Last Updated:** January 23, 2026
**Version:** 1.0.0
