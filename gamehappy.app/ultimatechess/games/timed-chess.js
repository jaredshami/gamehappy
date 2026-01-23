/**
 * Timed Chess with ELO Rating System
 * - Time controls: 1, 3, 5, 10 minutes per side
 * - ELO rating calculations
 * - Player statistics tracking
 */

class ELOCalculator {
    constructor(k = 32) {
        this.k = k; // K-factor (points exchanged per game)
    }

    calculateExpectedScore(playerRating, opponentRating) {
        return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    }

    calculateNewRating(playerRating, opponentRating, result, k) {
        // result: 1 for win, 0.5 for draw, 0 for loss
        const expected = this.calculateExpectedScore(playerRating, opponentRating);
        return Math.round(playerRating + k * (result - expected));
    }

    getKFactor(timeControl) {
        // Different K-factors for different time controls
        const factors = {
            1: 32,
            3: 24,
            5: 16,
            10: 8
        };
        return factors[timeControl] || 16;
    }
}

class TimedChessGame {
    constructor(auth) {
        this.auth = auth;
        this.playerId = auth.userId;
        this.playerRating = 1600;
        this.opponentRating = 1600;
        this.opponentId = null;
        this.playerColor = null;
        this.chess = new ChessBoard();
        this.timeControl = null;
        this.playerTimeRemaining = 0;
        this.opponentTimeRemaining = 0;
        this.gameActive = false;
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameStartTime = null;
        this.timerInterval = null;
        this.eloCalculator = new ELOCalculator();
        this.gameHistory = [];

        this.loadPlayerStats();
        this.setupEventListeners();
    }

    loadPlayerStats() {
        // Load from database via auth
        this.auth.getUserProfile().then(profile => {
            this.playerRating = profile.elo_rating || 1600;
            this.updateStatsDisplay();
        }).catch(err => {
            console.log('Using default rating');
            this.playerRating = 1600;
            this.updateStatsDisplay();
        });
    }

    savePlayerStats(result, ratingDelta) {
        const newRating = this.playerRating + ratingDelta;
        
        // Update database
        this.auth.updateUserStats('timed_chess', result).then(data => {
            // Also update ELO in database
            fetch('../api/auth/profile.php', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    elo_rating: newRating
                })
            });
        });

        this.playerRating = newRating;
    }

    updateStatsDisplay() {
        this.auth.getUserProfile().then(profile => {
            document.getElementById('player-elo').textContent = profile.elo_rating;
            document.getElementById('games-played').textContent = profile.timed_chess_games;

            if (profile.timed_chess_games > 0) {
                const winRate = ((profile.timed_chess_wins / profile.timed_chess_games) * 100).toFixed(1);
                document.getElementById('win-rate').textContent = winRate + '%';
            }
        }).catch(err => {
            document.getElementById('player-elo').textContent = this.playerRating;
            document.getElementById('games-played').textContent = '0';
            document.getElementById('win-rate').textContent = '-';
        });
    }

    setupEventListeners() {
        // Event listeners will be set up per screen
    }

    selectTimeControl(minutes) {
        this.timeControl = minutes;
        this.playerTimeRemaining = minutes * 60;
        this.opponentTimeRemaining = minutes * 60;

        document.getElementById('time-select-screen').classList.remove('active');
        document.getElementById('matchmaking-screen').classList.add('active');

        this.startMatchmaking();
    }

    startMatchmaking() {
        let searchTime = 0;
        const searchInterval = setInterval(() => {
            searchTime++;
            document.getElementById('search-time').textContent = searchTime;
        }, 1000);

        // Simulate finding opponent after 2-5 seconds
        const timeout = setTimeout(() => {
            clearInterval(searchInterval);

            if (document.getElementById('matchmaking-screen').classList.contains('active')) {
                this.startGame({
                    opponentId: 'opponent_' + Math.random().toString(36).substr(2, 9),
                    opponentName: 'Random Player',
                    opponentRating: 1600 + (Math.random() - 0.5) * 300
                });
            }
        }, 2000 + Math.random() * 3000);

        // Store timeout for cancellation
        this.matchmakingTimeout = timeout;
        this.matchmakingInterval = searchInterval;
    }

    cancelMatchmaking() {
        if (this.matchmakingInterval) clearInterval(this.matchmakingInterval);
        if (this.matchmakingTimeout) clearTimeout(this.matchmakingTimeout);

        document.getElementById('matchmaking-screen').classList.remove('active');
        document.getElementById('time-select-screen').classList.add('active');
    }

    startGame(config) {
        this.opponentId = config.opponentId;
        this.opponentRating = Math.round(config.opponentRating);
        this.playerColor = Math.random() > 0.5 ? 'white' : 'black';
        this.gameActive = true;
        this.chess.resetBoard();
        this.gameStartTime = Date.now();

        // Update UI
        document.getElementById('opponent-name').textContent = config.opponentName;
        document.getElementById('opponent-elo').textContent = this.opponentRating;
        document.getElementById('your-elo').textContent = this.playerRating;

        document.getElementById('matchmaking-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        this.renderBoard();
        this.startTimer();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.chess.currentPlayer === this.playerColor) {
                this.playerTimeRemaining--;
                if (this.playerTimeRemaining <= 0) {
                    this.gameActive = false;
                    this.endGame('loss', 'Time ran out!');
                }
            } else {
                this.opponentTimeRemaining--;
                if (this.opponentTimeRemaining <= 0) {
                    this.gameActive = false;
                    this.endGame('win', 'Opponent ran out of time!');
                }
            }
            this.updateTimerDisplay();
        }, 1000);
    }

    updateTimerDisplay() {
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const playerDisplay = document.getElementById('your-timer');
        const opponentDisplay = document.getElementById('opponent-timer');

        playerDisplay.textContent = formatTime(this.playerTimeRemaining);
        opponentDisplay.textContent = formatTime(this.opponentTimeRemaining);

        // Add warnings
        if (this.playerTimeRemaining < 30) {
            playerDisplay.classList.add(this.playerTimeRemaining < 10 ? 'critical' : 'warning');
        }
        if (this.opponentTimeRemaining < 30) {
            opponentDisplay.classList.add(this.opponentTimeRemaining < 10 ? 'critical' : 'warning');
        }
    }

    renderBoard() {
        const boardElement = document.getElementById('chessboard');
        boardElement.innerHTML = '';

        const board = this.chess.getBoard();
        const pieceMap = {
            'white_rook': '♖', 'white_knight': '♘', 'white_bishop': '♗',
            'white_queen': '♕', 'white_king': '♔', 'white_pawn': '♙',
            'black_rook': '♜', 'black_knight': '♞', 'black_bishop': '♝',
            'black_queen': '♛', 'black_king': '♚', 'black_pawn': '♟'
        };

        const startRow = this.playerColor === 'black' ? 0 : 7;
        const endRow = this.playerColor === 'black' ? 8 : -1;
        const rowStep = this.playerColor === 'black' ? 1 : -1;

        for (let row = startRow; row !== endRow; row += rowStep) {
            for (let col = this.playerColor === 'black' ? 0 : 7; col >= (this.playerColor === 'black' ? 7 : 0); col--) {
                const square = document.createElement('div');
                const isLight = (row + col) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;

                if (this.selectedSquare && this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                    square.classList.add('selected');
                }

                if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
                    square.classList.add('valid-move');
                }

                const piece = board[row][col];
                if (piece) {
                    const key = `${piece.color}_${piece.type}`;
                    square.textContent = pieceMap[key] || '';
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardElement.appendChild(square);
            }
        }
    }

    handleSquareClick(row, col) {
        if (!this.gameActive || this.chess.currentPlayer !== this.playerColor) return;

        const piece = this.chess.board[row][col];

        if (!this.selectedSquare) {
            if (piece && piece.color === this.playerColor) {
                this.selectedSquare = [row, col];
                this.calculateValidMoves();
            }
        } else if (this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
            this.selectedSquare = null;
            this.validMoves = [];
        } else if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
            const success = this.chess.makeMove(this.selectedSquare, [row, col]);
            if (success) {
                this.selectedSquare = null;
                this.validMoves = [];
                this.checkGameStatus();
            }
        } else if (piece && piece.color === this.playerColor) {
            this.selectedSquare = [row, col];
            this.calculateValidMoves();
        } else {
            this.selectedSquare = null;
            this.validMoves = [];
        }

        this.renderBoard();
    }

    calculateValidMoves() {
        this.validMoves = [];
        if (!this.selectedSquare) return;

        const [row, col] = this.selectedSquare;
        for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
                if (this.chess.isValidMove([row, col], [toRow, toCol], this.playerColor)) {
                    this.validMoves.push([toRow, toCol]);
                }
            }
        }
    }

    checkGameStatus() {
        const status = this.chess.getGameStatus();
        if (status.status !== 'playing') {
            this.gameActive = false;
            if (status.status === 'checkmate') {
                const winner = status.winner === this.playerColor ? 'win' : 'loss';
                this.endGame(winner, `Checkmate! ${status.winner} wins!`);
            } else {
                this.endGame('draw', 'Draw - Stalemate!');
            }
        }
    }

    resignGame() {
        if (confirm('Are you sure you want to resign?')) {
            this.gameActive = false;
            this.endGame('loss', 'You resigned');
        }
    }

    offerDraw() {
        alert('Draw offer sent to opponent');
    }

    endGame(result, message) {
        clearInterval(this.timerInterval);
        this.gameActive = false;

        const k = this.eloCalculator.getKFactor(this.timeControl);
        const resultValue = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
        const newRating = this.eloCalculator.calculateNewRating(
            this.playerRating,
            this.opponentRating,
            resultValue,
            k
        );
        const ratingDelta = newRating - this.playerRating;

        this.savePlayerStats(result, ratingDelta);

        // Show result
        document.getElementById('result-title').textContent = message;
        document.getElementById('result-message').textContent = `${result.toUpperCase()}`;
        document.getElementById('old-rating').textContent = this.playerRating;
        document.getElementById('new-rating').textContent = newRating;

        const deltaElement = document.getElementById('rating-delta');
        if (ratingDelta > 0) {
            deltaElement.innerHTML = `<span class="delta-plus">+${ratingDelta} ELO</span>`;
        } else if (ratingDelta < 0) {
            deltaElement.innerHTML = `<span class="delta-minus">${ratingDelta} ELO</span>`;
        } else {
            deltaElement.innerHTML = `<span>±0 ELO</span>`;
        }

        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('result-screen').classList.add('active');
    }

    playAgain() {
        this.chess.resetBoard();
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameActive = false;

        document.getElementById('result-screen').classList.remove('active');
        document.getElementById('time-select-screen').classList.add('active');
        this.updateStatsDisplay();
    }

    exitGame() {
        if (this.gameActive && !confirm('Game in progress. Exit?')) return;
        clearInterval(this.timerInterval);
        this.gameActive = false;
        this.playAgain();
    }
}

let game;

function selectTimeControl(minutes) {
    game.selectTimeControl(minutes);
}

function cancelMatchmaking() {
    game.cancelMatchmaking();
}

function resignGame() {
    game.resignGame();
}

function offerDraw() {
    game.offerDraw();
}

function exitGame() {
    game.exitGame();
}

function playAgain() {
    game.playAgain();
}

function backToMenu() {
    window.location.href = '../index.html';
}

function goBack() {
    window.location.href = '../index.html';
}

// Extended auth for timed chess
class TimedChessAuth extends GameHappyAuth {
    onSessionValid() {
        game = new TimedChessGame(this);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const auth = new TimedChessAuth();
});
