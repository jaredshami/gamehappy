/**
 * Wack-a-Chess Game Logic
 * 3-Player Chess Variant:
 * - Two players play chess (white & black)
 * - Third player is the "wacker" who guesses piece moves
 * - Wacker wins by eliminating both queens
 * - Chess players win by checkmate
 */

class WackAChessGame {
    constructor() {
        this.playerId = this.generatePlayerId();
        this.gameId = null;
        this.playerRole = null; // 'white', 'black', or 'wacker'
        this.players = {}; // { role: { id, name, ready } }
        this.chess = new ChessBoard();
        this.gameActive = false;
        this.gamePhase = 'waiting'; // 'waiting', 'assign-roles', 'playing', 'ended'
        this.selectedSquare = null;
        this.validMoves = [];
        this.moveLog = [];
        this.wackerGuess = null;
        this.wackerHits = 0;
        this.wackerAttempts = 0;
        this.lastMove = null;
        this.eliminatedPieces = [];
    }

    generatePlayerId() {
        return 'wack_' + Math.random().toString(36).substr(2, 9);
    }

    generateGameCode() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    createGame() {
        this.gameId = this.generateGameCode();
        this.players = {
            white: { id: this.playerId, name: 'You', role: 'white', ready: false },
            black: { id: null, name: 'Waiting...', role: 'black', ready: false },
            wacker: { id: null, name: 'Waiting...', role: 'wacker', ready: false }
        };

        document.getElementById('display-game-code').textContent = this.gameId;
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('waiting-room-screen').classList.add('active');
        this.playerRole = 'white';
        this.updateWaitingRoom();
    }

    joinGame(code) {
        if (!code || code.length !== 6) {
            alert('Invalid game code');
            return;
        }

        // In production, validate code with server
        this.gameId = code;
        
        // Simulate joining
        this.players = {
            white: { id: 'player1', name: 'Creator', role: 'white', ready: false },
            black: { id: this.playerId, name: 'You', role: 'black', ready: false },
            wacker: { id: null, name: 'Waiting...', role: 'wacker', ready: false }
        };

        this.playerRole = 'black';
        document.getElementById('display-game-code').textContent = code;
        document.getElementById('menu-screen').classList.remove('active');
        document.getElementById('waiting-room-screen').classList.add('active');
        this.updateWaitingRoom();
    }

    updateWaitingRoom() {
        // Update slot displays
        Object.keys(this.players).forEach((role, index) => {
            const player = this.players[role];
            const slot = document.getElementById(`slot-${index}`);
            if (player.id) {
                slot.innerHTML = `
                    <div class="slot-icon">${role === 'wacker' ? '🔨' : role === 'white' ? '⚪' : '⚫'}</div>
                    <p>${player.name}</p>
                `;
            }
        });

        // Check if all players are present
        const allPresent = Object.values(this.players).every(p => p.id);
        if (allPresent) {
            this.startRoleAssignment();
        }
    }

    simulatePlayerJoin() {
        if (!this.players.black.id && !this.players.wacker.id) {
            setTimeout(() => {
                this.players.black.id = 'player2';
                this.players.black.name = 'Friend Player 1';
                this.updateWaitingRoom();
            }, 1500);

            setTimeout(() => {
                this.players.wacker.id = 'player3';
                this.players.wacker.name = 'Friend Player 2';
                this.updateWaitingRoom();
            }, 3000);
        }
    }

    cancelWait() {
        document.getElementById('waiting-room-screen').classList.remove('active');
        document.getElementById('menu-screen').classList.add('active');
        this.gameId = null;
    }

    startRoleAssignment() {
        // Assign roles (for now, just confirm player's role)
        document.getElementById('waiting-room-screen').classList.remove('active');
        document.getElementById('role-screen').classList.add('active');
        this.showRoleDisplay();
    }

    showRoleDisplay() {
        const roleDisplay = document.getElementById('role-display');
        const roleEmojis = { white: '⚪', black: '⚫', wacker: '🔨' };
        const roleDescriptions = {
            white: 'WHITE PLAYER - Play chess as white pieces',
            black: 'BLACK PLAYER - Play chess as black pieces',
            wacker: 'WACKER - Guess where pieces move and eliminate them!'
        };

        roleDisplay.innerHTML = `
            <div>${roleEmojis[this.playerRole]}</div>
            <div class="role-description">${roleDescriptions[this.playerRole]}</div>
        `;
    }

    confirmRole() {
        document.getElementById('role-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');
        this.startGame();
    }

    startGame() {
        this.gameActive = true;
        this.gamePhase = 'playing';
        this.chess.resetBoard();

        // Update UI
        document.getElementById('white-name').textContent = this.players.white.name;
        document.getElementById('black-name').textContent = this.players.black.name;

        if (this.playerRole === 'wacker') {
            document.getElementById('wack-panel').classList.remove('hidden');
            document.getElementById('chess-panel').style.display = 'none';
        } else {
            document.getElementById('wack-panel').classList.add('hidden');
            document.getElementById('chess-panel').style.display = 'block';
        }

        this.renderBoard();
        this.updateGameStatus();
        this.simulatePlayerJoin(); // For demo
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

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const isLight = (row + col) % 2 === 0;
                square.className = `square ${isLight ? 'light' : 'dark'}`;

                if (this.selectedSquare && this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                    square.classList.add('selected');
                }

                if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
                    square.classList.add('valid-move');
                }

                // Check if piece is in elimination list
                const piece = board[row][col];
                if (piece && !this.eliminatedPieces.some(p => p[0] === row && p[1] === col)) {
                    const key = `${piece.color}_${piece.type}`;
                    square.textContent = pieceMap[key] || '';
                    square.classList.add('piece');
                } else if (piece) {
                    square.textContent = '💨'; // Eliminated piece marker
                    square.style.opacity = '0.5';
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardElement.appendChild(square);
            }
        }

        this.renderWackBoard();
    }

    renderWackBoard() {
        if (this.playerRole !== 'wacker') return;

        const wackBoard = document.getElementById('wack-board');
        wackBoard.innerHTML = '';

        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                square.className = 'wack-square';
                square.textContent = String.fromCharCode(97 + col) + (8 - row);
                square.addEventListener('click', () => {
                    document.getElementById('wack-input').value = 
                        String.fromCharCode(97 + col) + (8 - row);
                });
                wackBoard.appendChild(square);
            }
        }
    }

    handleSquareClick(row, col) {
        if (!this.gameActive) return;
        if (this.playerRole === 'wacker') return; // Wacker doesn't click the board
        if (this.chess.currentPlayer !== this.playerRole) {
            alert("It's not your turn!");
            return;
        }

        const piece = this.chess.board[row][col];

        if (!this.selectedSquare) {
            if (piece && piece.color === this.playerRole && 
                !this.eliminatedPieces.some(p => p[0] === row && p[1] === col)) {
                this.selectedSquare = [row, col];
                this.calculateValidMoves();
            }
        } else {
            if (this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                this.selectedSquare = null;
                this.validMoves = [];
            } else if (this.validMoves.some(move => move[0] === row && move[1] === col)) {
                this.lastMove = { from: this.selectedSquare, to: [row, col] };
                this.updateMoveDisplay();
            } else if (piece && piece.color === this.playerRole && 
                       !this.eliminatedPieces.some(p => p[0] === row && p[1] === col)) {
                this.selectedSquare = [row, col];
                this.calculateValidMoves();
            } else {
                this.selectedSquare = null;
                this.validMoves = [];
            }
        }

        this.renderBoard();
    }

    calculateValidMoves() {
        this.validMoves = [];
        if (!this.selectedSquare) return;

        const [row, col] = this.selectedSquare;
        for (let toRow = 0; toRow < 8; toRow++) {
            for (let toCol = 0; toCol < 8; toCol++) {
                if (this.chess.isValidMove([row, col], [toRow, toCol], this.playerRole)) {
                    this.validMoves.push([toRow, toCol]);
                }
            }
        }
    }

    updateMoveDisplay() {
        if (this.lastMove) {
            const [fromRow, fromCol] = this.lastMove.from;
            const [toRow, toCol] = this.lastMove.to;
            const from = String.fromCharCode(97 + fromCol) + (8 - fromRow);
            const to = String.fromCharCode(97 + toCol) + (8 - toRow);

            document.getElementById('move-display').textContent = `${from} → ${to}`;
            document.getElementById('confirm-move-btn').disabled = false;
        }
    }

    confirmMove() {
        if (!this.lastMove) return;

        const success = this.chess.makeMove(this.lastMove.from, this.lastMove.to);
        if (success) {
            this.addMoveLog(`${this.playerRole} moved`);
            this.selectedSquare = null;
            this.validMoves = [];
            this.lastMove = null;
            this.wackerGuess = null;

            // Wacker's turn to guess
            if (this.playerRole !== 'wacker') {
                alert('Wacker, make your guess!');
            }

            this.updateGameStatus();
            this.renderBoard();
        }
    }

    submitWackGuess() {
        const input = document.getElementById('wack-input').value.toLowerCase();
        if (!input || input.length !== 2) {
            alert('Enter a valid square (e.g., e4)');
            return;
        }

        const col = input.charCodeAt(0) - 97;
        const row = 8 - parseInt(input[1]);

        if (col < 0 || col > 7 || row < 0 || row > 7) {
            alert('Invalid square');
            return;
        }

        this.wackerAttempts++;
        const lastTo = this.lastMove ? this.lastMove.to : null;

        const isCorrect = lastTo && lastTo[0] === row && lastTo[1] === col;

        if (isCorrect) {
            this.wackerHits++;
            // Eliminate the piece
            this.eliminatedPieces.push([row, col]);

            // Check if queens are eliminated
            const whiteQueenEliminated = this.eliminatedPieces.some(p => {
                const piece = this.chess.board[p[0]][p[1]];
                return piece && piece.type === 'queen' && piece.color === 'white';
            });
            const blackQueenEliminated = this.eliminatedPieces.some(p => {
                const piece = this.chess.board[p[0]][p[1]];
                return piece && piece.type === 'queen' && piece.color === 'black';
            });

            if (whiteQueenEliminated && blackQueenEliminated) {
                this.endGame('wacker', 'Wacker eliminated both queens!');
                return;
            }

            document.getElementById('wack-result').classList.add('hit');
            document.getElementById('wack-result').classList.remove('miss');
            document.getElementById('wack-result').textContent = '✓ HIT! Piece eliminated!';
            this.addMoveLog(`Wacker HIT on ${input}`);
        } else {
            document.getElementById('wack-result').classList.remove('hit');
            document.getElementById('wack-result').classList.add('miss');
            document.getElementById('wack-result').textContent = '✗ Miss!';
            this.addMoveLog(`Wacker MISSED`);
        }

        document.getElementById('wack-result').classList.remove('hidden');
        document.getElementById('wack-input').value = '';

        setTimeout(() => {
            this.checkGameStatus();
        }, 1500);
    }

    addMoveLog(message) {
        const logEntries = document.getElementById('log-entries');
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = message;
        logEntries.insertBefore(entry, logEntries.firstChild);
    }

    checkGameStatus() {
        const status = this.chess.getGameStatus();
        if (status.status !== 'playing') {
            const winner = status.winner === 'white' ? 'white' : 'black';
            this.endGame(winner, `${winner.toUpperCase()} checkmated ${winner === 'white' ? 'black' : 'white'}!`);
        }

        this.renderBoard();
    }

    updateGameStatus() {
        const currentTeam = this.chess.currentPlayer === 'white' ? '⚪ White' : '⚫ Black';
        document.getElementById('current-turn').textContent = currentTeam + ' to Move';

        const whiteCount = this.countRemainingPieces('white');
        const blackCount = this.countRemainingPieces('black');
        document.getElementById('white-pieces').textContent = whiteCount + ' pieces';
        document.getElementById('black-pieces').textContent = blackCount + ' pieces';
    }

    countRemainingPieces(color) {
        const board = this.chess.getBoard();
        let count = 0;
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece && piece.color === color && 
                    !this.eliminatedPieces.some(p => p[0] === row && p[1] === col)) {
                    count++;
                }
            }
        }
        return count;
    }

    endGame(winner, message) {
        this.gameActive = false;
        this.gamePhase = 'ended';

        const winnerText = {
            'white': '⚪ White Player',
            'black': '⚫ Black Player',
            'wacker': '🔨 Wacker'
        }[winner];

        document.getElementById('game-over-title').textContent = 'Game Over!';
        document.getElementById('game-over-message').textContent = message;

        document.getElementById('winner-display').innerHTML = `
            <div>${winnerText}</div>
            <div class="winner-text">WINS!</div>
        `;

        document.getElementById('final-moves').textContent = this.chess.moveHistory.length;
        document.getElementById('pieces-wacked').textContent = this.wackerHits;
        document.getElementById('wacker-accuracy').textContent = 
            this.wackerAttempts > 0 ? Math.round((this.wackerHits / this.wackerAttempts) * 100) + '%' : '0%';

        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.add('active');
    }

    exitGame() {
        if (this.gameActive && !confirm('Game in progress. Exit?')) return;
        this.playAgain();
    }

    playAgain() {
        this.chess.resetBoard();
        this.selectedSquare = null;
        this.validMoves = [];
        this.gameActive = false;
        this.playerRole = null;
        this.players = {};
        this.eliminatedPieces = [];
        this.moveLog = [];
        this.wackerHits = 0;
        this.wackerAttempts = 0;

        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('menu-screen').classList.add('active');
    }
}

let game;

function createGame() {
    game.createGame();
}

function joinGame() {
    const code = document.getElementById('game-code-input').value.toUpperCase();
    game.joinGame(code);
}

function cancelWait() {
    game.cancelWait();
}

function confirmRole() {
    game.confirmRole();
}

function confirmMove() {
    game.confirmMove();
}

function submitWackGuess() {
    game.submitWackGuess();
}

function exitGame() {
    game.exitGame();
}

function playAgain() {
    game.playAgain();
}

function goBackToMenu() {
    window.location.href = '../index.html';
}

function goBack() {
    window.location.href = '../index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    game = new WackAChessGame();
});
