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
        this.nudgeCheckInterval = null;
        this.nudgeButtonInterval = null;
        this.nudgeResponded = false;
        this.nudgeAlertShowing = false; // Track if nudge alert is currently displayed
        this.currentNudgeId = null; // Track the current nudge we're responding to
        this.lastNudgeSentId = null; // Track last nudge WE sent
        this.hasMoved = false; // Track if player has made their first move
        this.selectedSquare = null;
        this.validMoves = [];
        this.lastMoveTime = 0;
        this.lastMoveId = 0;

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
        this.hasMoved = false; // Reset flag at game start
        this.lastMoveTime = 0; // Don't set move time until player actually moves

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
        
        // Start polling for nudges every 1000ms
        this.nudgeCheckInterval = setInterval(() => this.checkForNudges(), 1000);
        
        // Update nudge button state every 500ms (check if 10 seconds have passed and whose turn it is)
        this.nudgeButtonInterval = setInterval(() => this.updateNudgeButtonState(), 500);

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
                    square.classList.add(piece.color === 'white' ? 'white-piece' : 'black-piece');
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
            console.log('Making move from', this.selectedSquare, 'to', [row, col]);
            
            const movingPiece = this.chess.board[this.selectedSquare[0]][this.selectedSquare[1]];
            const isKnight = movingPiece && movingPiece.type === 'knight';
            const isCastling = movingPiece && 
                               movingPiece.type === 'king' &&
                               Math.abs(this.selectedSquare[1] - col) === 2;
            
            const success = this.chess.makeMove(this.selectedSquare, [row, col]);
            console.log('Move success:', success);
            if (success) {
                // Save move before clearing selectedSquare
                const move = [this.selectedSquare, [row, col]];
                this.selectedSquare = null;
                this.validMoves = [];
                
                // Animate the move with special effects
                this.animateMove(move[0], move[1], isCastling, isKnight);
                
                // Delay re-render and game update to allow animation to play
                setTimeout(() => {
                    this.renderBoard();
                    console.log('Calling updateGameStatus after move');
                    this.updateGameStatus();
                    this.sendMoveToOpponent(move);
                }, isKnight ? 600 : 450);
                
                return; // Don't call renderBoard again below
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

    animateMove(from, to, isCastling, isKnight) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        
        // Get the pieces before move is applied
        const targetPiece = this.chess.board[toRow][toCol];
        
        // Find squares in DOM
        const fromSquare = document.querySelector(`[data-row="${fromRow}"][data-col="${fromCol}"]`);
        const toSquare = document.querySelector(`[data-row="${toRow}"][data-col="${toCol}"]`);
        
        if (isKnight) {
            // Knight jump animation - higher arc
            if (fromSquare) {
                fromSquare.classList.add('knight-jump');
                fromSquare.style.animation = 'none';
                // Trigger reflow
                void fromSquare.offsetWidth;
                fromSquare.style.animation = '';
            }
            
            if (toSquare) {
                toSquare.classList.add('knight-landing');
                toSquare.style.animation = 'none';
                void toSquare.offsetWidth;
                toSquare.style.animation = '';
            }
            
            // Animate capture if needed
            if (targetPiece && toSquare) {
                toSquare.classList.add('captured');
            }
        } else if (isCastling) {
            // For castling, animate the king scaling
            if (fromSquare) {
                fromSquare.classList.add('castling-king');
            }
            
            // Find and animate the rook too
            let rookFrom, rookTo;
            if (toCol > fromCol) {
                // King-side castling (king moves right)
                rookFrom = [fromRow, 7];
                rookTo = [fromRow, 5];
            } else {
                // Queen-side castling (king moves left)
                rookFrom = [fromRow, 0];
                rookTo = [fromRow, 3];
            }
            
            const rookSquareFrom = document.querySelector(`[data-row="${rookFrom[0]}"][data-col="${rookFrom[1]}"]`);
            if (rookSquareFrom) {
                rookSquareFrom.classList.add('castling-rook');
            }
        } else {
            // Regular move animation
            if (fromSquare) {
                fromSquare.classList.add('moving');
            }
            
            // Animate capture if there's a target piece
            if (targetPiece && toSquare) {
                toSquare.classList.add('captured');
            }
            
            if (toSquare) {
                toSquare.classList.add('arriving');
            }
        }
        
        console.log('Animation applied for', isCastling ? 'castling' : isKnight ? 'knight' : 'regular', 'move');
    }

    sendMoveToOpponent(move) {
        // Send move to server for opponent to retrieve
        const [from, to] = move;
        const fromPiece = this.chess.board[from[0]][from[1]];
        const isPawnDoubleMove = fromPiece && fromPiece.type === 'pawn' && Math.abs(from[0] - to[0]) === 2;
        
        // Mark that you've moved and reset nudge timer
        this.hasMoved = true;
        this.lastMoveTime = Date.now();
        
        fetch('/api/moves.php?action=send_move', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_code: this.gameId,
                from_row: from[0],
                from_col: from[1],
                to_row: to[0],
                to_col: to[1],
                is_pawn_double_move: isPawnDoubleMove ? 1 : 0
            })
        })
        .catch(err => console.error('Error sending move:', err));
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
                    // Sync pawn double move for en passant
                    if (moveData.is_pawn_double_move) {
                        this.chess.lastPawnDoubleMove = {
                            from: moveData.from,
                            to: moveData.to,
                            color: this.chess.currentPlayer === 'white' ? 'black' : 'white'
                        };
                    }
                    
                    // Apply opponent's move - makeMove handles validation and currentPlayer toggle
                    const success = this.chess.makeMove(moveData.from, moveData.to);
                    if (success) {
                        this.lastMoveId = moveData.id;
                        this.renderBoard();
                        this.updateGameStatus();
                    } else {
                        console.error('Failed to apply opponent move:', moveData);
                    }
                });
            }
        })
        .catch(err => console.error('Error checking moves:', err));
    }

    updateNudgeButtonState() {
        if (!this.gameActive) return;
        
        const nudgeBtn = document.getElementById('nudge-button');
        
        // Don't show button until you've moved
        if (!this.hasMoved) {
            nudgeBtn.style.display = 'none';
            nudgeBtn.disabled = true;
            return;
        }
        
        const secondsSinceMyMove = (Date.now() - this.lastMoveTime) / 1000;
        const isOpponentsTurn = this.chess.currentPlayer !== this.playerColor;
        
        // Show button ONLY when: 10+ seconds since I moved AND it's opponent's turn
        const shouldShow = isOpponentsTurn && secondsSinceMyMove >= 10;
        
        if (shouldShow) {
            nudgeBtn.style.display = 'block';
            nudgeBtn.disabled = false;
        } else {
            nudgeBtn.style.display = 'none';
            nudgeBtn.disabled = true;
        }
    }

    nudgeOpponent() {
        if (!this.gameActive) return;
        
        const nudgeBtn = document.getElementById('nudge-button');
        nudgeBtn.disabled = true; // Disable button immediately after clicking
        nudgeBtn.style.display = 'none'; // Hide the button
        
        // Track that we sent a nudge
        this.lastNudgeSentTime = Date.now();
        
        fetch('/api/nudge.php?action=send_nudge', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                game_code: this.gameId,
                nudged_player_id: this.opponentId  // Send to opponent, not both
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                console.log('Nudge sent!');
                this.lastNudgeSentId = data.nudge_id; // Track this nudge ID
            }
        })
        .catch(err => console.error('Error sending nudge:', err));
    }

    checkForNudges() {
        if (!this.gameActive) return;
        
        fetch(`/api/nudge.php?action=check_nudge&game_code=${this.gameId}`, {
            credentials: 'include'
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return;
            
            if (data.has_nudge && data.nudge_id !== this.currentNudgeId) {
                // NEW nudge received that we haven't shown yet
                if (data.forfeit) {
                    this.endGame(this.playerColor === 'white' ? 'White wins by forfeit!' : 'Black wins by forfeit!', this.playerColor);
                } else {
                    const nudgeAlert = document.getElementById('nudge-alert');
                    nudgeAlert.dataset.nudgeId = data.nudge_id;
                    nudgeAlert.classList.remove('hidden');
                    this.currentNudgeId = data.nudge_id;
                    this.nudgeAlertShowing = true;
                    this.startNudgeTimer(data.nudge_id, data.seconds_remaining);
                }
            } else if (!data.has_nudge && this.currentNudgeId !== null) {
                // Nudge we were responding to is gone - opponent may have already handled it
                // Clear our alert
                if (this.nudgeAlertShowing) {
                    document.getElementById('nudge-alert').classList.add('hidden');
                    this.nudgeAlertShowing = false;
                }
                this.currentNudgeId = null;
                if (this.nudgeTimeout) {
                    clearInterval(this.nudgeTimeout);
                    this.nudgeTimeout = null;
                }
            } else if (!data.has_nudge && this.lastNudgeSentId !== null) {
                // No active nudge AND we sent one - it was responded to!
                // Reset button timer so it can appear again after 10 seconds
                this.lastMoveTime = Date.now();
                this.lastNudgeSentId = null;
            }
        })
        .catch(err => console.error('Error checking nudges:', err));
    }

    startNudgeTimer(nudgeId, initialSeconds) {
        // Clear any existing timer
        if (this.nudgeTimeout) {
            clearInterval(this.nudgeTimeout);
            this.nudgeTimeout = null;
        }
        
        let timeLeft = initialSeconds || 30; // 30 second countdown
        const countdownEl = document.getElementById('nudge-countdown');
        countdownEl.textContent = timeLeft;
        
        this.nudgeTimeout = setInterval(() => {
            timeLeft--;
            countdownEl.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(this.nudgeTimeout);
                this.nudgeTimeout = null;
                if (this.nudgeAlertShowing && !this.nudgeResponded) {
                    this.endGame('You forfeited by not responding!', 'opponent');
                }
            }
        }, 1000);
    }

    respondToNudge() {
        const nudgeAlert = document.getElementById('nudge-alert');
        const nudgeId = nudgeAlert.dataset.nudgeId;
        
        if (!nudgeId) {
            console.error('No nudge_id found in dataset');
            return;
        }
        
        fetch('/api/nudge.php?action=respond_nudge', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nudge_id: parseInt(nudgeId)
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Clear timer and hide alert
                if (this.nudgeTimeout) {
                    clearInterval(this.nudgeTimeout);
                    this.nudgeTimeout = null;
                }
                nudgeAlert.classList.add('hidden');
                this.nudgeAlertShowing = false;
                this.nudgeResponded = true;
                
                // Reset nudge button timer - opponent responded counts as their "move"
                this.lastMoveTime = Date.now();
            }
        })
        .catch(err => console.error('Error responding to nudge:', err));
    }

    updateGameStatus() {
        const whiteCheckmate = this.chess.isCheckmate('white');
        const blackCheckmate = this.chess.isCheckmate('black');
        const whiteInCheck = this.chess.isInCheck('white');
        const blackInCheck = this.chess.isInCheck('black');
        const whiteHasLegalMoves = this.chess.hasLegalMoves('white');
        const blackHasLegalMoves = this.chess.hasLegalMoves('black');
        
        console.log('White - In Check:', whiteInCheck, 'Has Legal Moves:', whiteHasLegalMoves, 'Checkmate:', whiteCheckmate);
        console.log('Black - In Check:', blackInCheck, 'Has Legal Moves:', blackHasLegalMoves, 'Checkmate:', blackCheckmate);
        
        const status = this.chess.getGameStatus();
        console.log('Game Status:', status, 'Current Player:', this.chess.currentPlayer);
        if (status.status !== 'playing') {
            this.gameActive = false;
            const message = status.status === 'checkmate' 
                ? `Checkmate! ${status.winner} wins!`
                : 'Stalemate - Draw!';
            console.log('Game ending with:', message);
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
        clearInterval(this.nudgeCheckInterval);
        clearInterval(this.nudgeButtonInterval);
        clearInterval(this.nudgeTimeout);
        document.getElementById('result-title').textContent = message;
        
        let resultMessage = 'Game ended in a draw';
        if (winner) {
            const winnerName = winner === 'white' ? 'White' : 'Black';
            resultMessage = `${winnerName} is victorious!`;
        }
        document.getElementById('result-message').textContent = resultMessage;
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
