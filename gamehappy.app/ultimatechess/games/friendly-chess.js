/**
 * Friendly Chess Game Logic
 * - Player matchmaking and friend codes
 * - Nudge system with forfeit mechanism
 * - Real-time board updates
 */

class FriendlyChessGame {
    constructor() {
        this.gameId = null;
        this.playerId = this.generatePlayerId();
        this.opponentId = null;
        this.playerColor = null;
        this.chess = new ChessBoard();
        this.ws = null;
        this.searching = false;
        this.gameActive = false;
        this.nudgeTimeout = null;
        this.nudgeResponded = false;
        this.selectedSquare = null;
        this.validMoves = [];

        this.initializeWebSocket();
        this.setupEventListeners();
        this.renderBoard();
    }

    generatePlayerId() {
        return 'player_' + Math.random().toString(36).substr(2, 9);
    }

    generateGameCode() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    initializeWebSocket() {
        // In production, connect to actual WebSocket server
        // For now, we'll use a simulated connection
        this.simulateWebSocket();
    }

    simulateWebSocket() {
        // Simulated WebSocket for development
        this.simulatedMessages = [];
    }

    setupEventListeners() {
        // Board click listeners will be set up when board is rendered
        this.renderBoard();
    }

    findRandomOpponent() {
        this.searching = true;
        document.getElementById('search-status').classList.remove('hidden');

        // First, leave queue if already in it (cleanup from previous attempt)
        fetch('/api/matchmaking.php?action=leave_queue', {
            method: 'POST',
            credentials: 'include'
        })
        .then(() => {
            // Now join fresh
            return fetch('/api/matchmaking.php?action=join_queue', {
                method: 'POST',
                credentials: 'include'
            });
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert('Error: ' + data.message);
                this.searching = false;
                document.getElementById('search-status').classList.add('hidden');
                return;
            }

            // Poll for match every 1 second
            this.matchCheckInterval = setInterval(() => this.checkForMatch(), 1000);
        })
        .catch(err => {
            console.error('Error joining queue:', err);
            alert('Connection error. Make sure you are logged in.');
            this.searching = false;
            document.getElementById('search-status').classList.add('hidden');
        });
    }

    checkForMatch() {
        if (!this.searching) {
            clearInterval(this.matchCheckInterval);
            return;
        }

        fetch('/api/matchmaking.php?action=check_match', {
            credentials: 'include'
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                console.error('Error checking match:', data.message);
                return;
            }

            if (data.matched) {
                clearInterval(this.matchCheckInterval);
                this.startGame({
                    gameId: data.game_code,
                    playerColor: data.your_color,
                    opponentId: data.opponent_id,
                    opponentName: data.opponent_name
                });
            } else {
                // Update queue position display
                const statusText = document.querySelector('#search-status p');
                if (statusText) {
                    statusText.textContent = `Searching for opponent... (Position: ${data.queue_position}, Total waiting: ${data.players_waiting})`;
                }
            }
        })
        .catch(err => console.error('Error checking match:', err));
    }

    cancelSearch() {
        this.searching = false;
        clearInterval(this.matchCheckInterval);
        document.getElementById('search-status').classList.add('hidden');

        // Notify server to leave queue
        fetch('/api/matchmaking.php?action=leave_queue', {
            method: 'POST',
            credentials: 'include'
        }).catch(err => console.error('Error leaving queue:', err));
    }

    createGame() {
        const gameCode = this.generateGameCode();
        this.gameId = gameCode;
        this.playerColor = 'white'; // Creator is always white
        alert(`Game created! Share this code with your friend: ${gameCode}`);
        
        // Switch to game screen and wait for opponent
        this.showGameScreen();
        document.getElementById('display-game-id').textContent = gameCode;
    }

    joinGameWithCode() {
        const code = document.getElementById('game-code').value.toUpperCase();
        if (!code || code.length !== 6) {
            alert('Please enter a valid 6-character code');
            return;
        }

        // In production, validate code with server
        this.gameId = code;
        this.playerColor = 'black'; // Joiner is always black
        this.startGame({
            gameId: code,
            playerColor: 'black',
            opponentId: 'opponent_' + Math.random().toString(36).substr(2, 9),
            opponentName: 'Friend Player'
        });
    }

    startGame(config) {
        this.gameId = config.gameId;
        this.playerColor = config.playerColor;
        this.opponentId = config.opponentId;
        this.gameActive = true;
        this.chess.resetBoard();
        this.searching = false;
        this.lastMoveId = 0;

        // Update UI
        document.getElementById('search-status').classList.add('hidden');
        document.getElementById('opponent-name').textContent = config.opponentName;
        document.getElementById('your-color').textContent = `You are ${this.playerColor === 'white' ? '⚪ White' : '⚫ Black'}`;
        document.getElementById('opponent-status').textContent = 'Connected';
        document.getElementById('display-game-id').textContent = this.gameId;

        this.showGameScreen();
        this.renderBoard();
        this.updateGameStatus();
        
        // Start polling for opponent moves every 500ms
        this.moveCheckInterval = setInterval(() => this.checkForOpponentMoves(), 500);
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

        // Board orientation: 
        // White player: row 0 at top (black pieces), row 7 at bottom (white pieces)
        // Black player: row 7 at top (white pieces), row 0 at bottom (black pieces)
        const startRow = this.playerColor === 'white' ? 0 : 7;
        const endRow = this.playerColor === 'white' ? 8 : -1;
        const rowStep = this.playerColor === 'white' ? 1 : -1;
        
        const startCol = this.playerColor === 'white' ? 0 : 7;
        const endCol = this.playerColor === 'white' ? 8 : -1;
        const colStep = this.playerColor === 'white' ? 1 : -1;

        for (let row = startRow; row !== endRow; row += rowStep) {
            for (let col = startCol; col !== endCol; col += colStep) {
                const square = document.createElement('div');
                const isLight = (row + col) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;
                square.dataset.row = row;
                square.dataset.col = col;

                // Check if this is the selected square
                if (this.selectedSquare && this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                    square.classList.add('selected');
                }

                // Check if this is a valid move
                if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
                    square.classList.add('valid-move');
                }

                const piece = board[row][col];
                if (piece) {
                    const key = `${piece.color}_${piece.type}`;
                    square.textContent = pieceMap[key] || '';
                    square.classList.add('piece');
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardElement.appendChild(square);
            }
        }
    }

    handleSquareClick(row, col) {
        if (!this.gameActive) return;
        if (this.chess.currentPlayer !== this.playerColor) {
            alert("It's not your turn!");
            return;
        }

        const piece = this.chess.board[row][col];

        // First click - select a piece
        if (!this.selectedSquare) {
            if (piece && piece.color === this.playerColor) {
                this.selectedSquare = [row, col];
                this.calculateValidMoves();
            }
            this.renderBoard();
            return;
        }

        // Second click - try to move
        if (this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
            // Deselect
            this.selectedSquare = null;
            this.validMoves = [];
        } else if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
            // Valid move
            const success = this.chess.makeMove(this.selectedSquare, [row, col]);
            if (success) {
                // Save move before clearing selectedSquare
                const move = [this.selectedSquare, [row, col]];
                this.selectedSquare = null;
                this.validMoves = [];
                this.renderBoard();
                this.updateGameStatus();
                this.sendMoveToOpponent(move);
            }
        } else if (piece && piece.color === this.playerColor) {
            // Select different piece
            this.selectedSquare = [row, col];
            this.calculateValidMoves();
        } else {
            // Invalid move attempt
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

    sendMoveToOpponent(move) {
        // Send move to server for opponent to retrieve
        const [from, to] = move;
        fetch('/api/moves.php?action=send_move', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_code: this.gameId,
                from_row: from[0],
                from_col: from[1],
                to_row: to[0],
                to_col: to[1]
            })
        })
        .catch(err => console.error('Error sending move:', err));
        
        // Reset nudge timer on successful move
        this.resetNudgeTimer();
    }

    checkForOpponentMoves() {
        if (!this.gameActive) {
            clearInterval(this.moveCheckInterval);
            return;
        }
        
        fetch(`/api/moves.php?action=get_moves&game_code=${this.gameId}&last_move_id=${this.lastMoveId}`, {
            credentials: 'include'
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;
            
            if (data.moves && data.moves.length > 0) {
                data.moves.forEach(moveData => {
                    // Apply opponent's move
                    const success = this.chess.makeMove(moveData.from, moveData.to);
                    if (success) {
                        this.lastMoveId = moveData.id;
                        this.renderBoard();
                        this.updateGameStatus();
                    }
                });
            }
        })
        .catch(err => console.error('Error checking moves:', err));
    }

    nudgeOpponent() {
        if (!this.gameActive) return;

        // Show nudge alert on opponent's side (we're simulating this)
        alert('Nudge sent! Opponent has 30 seconds to respond.');

        // Set timeout for forfeit
        this.startNudgeTimer();
    }

    startNudgeTimer() {
        this.nudgeResponded = false;
        let timeLeft = 30;

        this.nudgeTimeout = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(this.nudgeTimeout);
                if (!this.nudgeResponded) {
                    this.opponentForfeit();
                }
            }
        }, 1000);
    }

    resetNudgeTimer() {
        if (this.nudgeTimeout) {
            clearInterval(this.nudgeTimeout);
            this.nudgeTimeout = null;
        }
        this.nudgeResponded = false;
    }

    respondToNudge() {
        this.nudgeResponded = true;
        document.getElementById('nudge-alert').classList.add('hidden');
        alert("I'm here! Keep playing.");
    }

    opponentForfeit() {
        this.gameActive = false;
        this.endGame(this.playerColor + ' wins by forfeit!', this.playerColor);
    }

    updateGameStatus() {
        const status = this.chess.getGameStatus();
        if (status.status !== 'playing') {
            this.gameActive = false;
            const message = status.status === 'checkmate' 
                ? `Checkmate! ${status.winner} wins!`
                : 'Stalemate - Draw!';
            this.endGame(message, status.winner);
        }

        // Update nudge button state
        const nudgeBtn = document.getElementById('nudge-button');
        nudgeBtn.disabled = this.chess.currentPlayer !== this.playerColor;
    }

    resignGame() {
        if (confirm('Are you sure you want to resign?')) {
            this.gameActive = false;
            const winner = this.playerColor === 'white' ? 'Black' : 'White';
            this.endGame(`You resigned. ${winner} wins!`, this.playerColor === 'white' ? 'black' : 'white');
        }
    }

    offerDraw() {
        alert('Draw offer sent to opponent');
        // In production, wait for opponent response
    }

    endGame(message, winner) {
        this.gameActive = false;
        clearInterval(this.moveCheckInterval);
        document.getElementById('result-title').textContent = message;
        document.getElementById('result-message').textContent = winner ? 
            `${winner.toUpperCase()} is victorious!` : 
            'Game ended in a draw';
        this.showEndGameScreen();
    }

    playAgain() {
        this.gameId = null;
        this.opponentId = null;
        this.gameActive = false;
        this.chess.resetBoard();
        this.selectedSquare = null;
        this.validMoves = [];
        this.showLobby();
    }

    exitGame() {
        if (this.gameActive && !confirm('Game is in progress. Are you sure you want to exit?')) {
            return;
        }
        this.playAgain();
    }

    showGameScreen() {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        document.getElementById('end-game-screen').classList.remove('active');
    }

    showLobby() {
        document.getElementById('lobby-screen').classList.add('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('end-game-screen').classList.remove('active');
        document.getElementById('game-code').value = '';
    }

    showEndGameScreen() {
        document.getElementById('lobby-screen').classList.remove('active');
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('end-game-screen').classList.add('active');
    }
}

// Global game instance
let game;

// Global functions for HTML onclick handlers
function findRandomOpponent() {
    game.findRandomOpponent();
}

function cancelSearch() {
    game.cancelSearch();
}

function createGame() {
    game.createGame();
}

function joinGameWithCode() {
    game.joinGameWithCode();
}

function nudgeOpponent() {
    game.nudgeOpponent();
}

function respondToNudge() {
    game.respondToNudge();
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

function goBack() {
    window.location.href = '../index.html';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    game = new FriendlyChessGame();
});
