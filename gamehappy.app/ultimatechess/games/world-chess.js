/**
 * World Chess - Multiplayer Team Voting System
 * - Continuous games with different time controls
 * - Team voting determines moves
 * - 1 minute break between games for players to join
 */

class WorldChessGame {
    constructor() {
        this.playerId = this.generatePlayerId();
        this.gameId = null;
        this.timeControl = null; // in seconds
        this.playerTeam = null; // 'white' or 'black'
        this.chess = new ChessBoard();
        this.gameActive = false;
        this.currentMoveTimer = 0;
        this.timerInterval = null;
        this.selectedSquare = null;
        this.playerVote = null;
        this.whitePlayerCount = 0;
        this.blackPlayerCount = 0;
        this.moveNumber = 0;
        this.gameHistory = [];
        this.topVotes = [];
    }

    generatePlayerId() {
        return 'world_' + Math.random().toString(36).substr(2, 9);
    }

    generateGameId() {
        return 'world_game_' + Date.now();
    }

    selectWorldGame(timeSeconds) {
        this.timeControl = timeSeconds;
        this.simulateGameStats();

        document.getElementById('game-select-screen').classList.remove('active');
        document.getElementById('game-screen').classList.add('active');

        this.joinGame();
    }

    simulateGameStats() {
        const statsMap = {
            3: { players: '42', move: '15' },
            10: { players: '87', move: '23' },
            60: { players: '156', move: '8' },
            3600: { players: '312', move: '2' }
        };

        const stats = statsMap[this.timeControl] || { players: '50', move: '5' };
        const timeSuffix = {
            3: '3s',
            10: '10s',
            60: '60s',
            3600: '3600s'
        }[this.timeControl];
    }

    joinGame() {
        this.gameId = this.generateGameId();
        this.playerTeam = Math.random() > 0.5 ? 'white' : 'black';
        this.gameActive = true;
        this.chess.resetBoard();
        this.moveNumber = 1;
        this.whitePlayerCount = Math.floor(Math.random() * 150) + 50;
        this.blackPlayerCount = Math.floor(Math.random() * 150) + 50;

        // Update UI
        document.getElementById('white-players').textContent = this.whitePlayerCount + ' players';
        document.getElementById('black-players').textContent = this.blackPlayerCount + ' players';
        document.getElementById('move-number').textContent = this.moveNumber;

        this.renderBoard();
        this.startMoveTimer();
    }

    startMoveTimer() {
        this.currentMoveTimer = this.timeControl;

        this.timerInterval = setInterval(() => {
            this.currentMoveTimer--;

            const countdownElement = document.getElementById('move-countdown');
            countdownElement.textContent = this.currentMoveTimer;

            if (this.currentMoveTimer < 10) {
                countdownElement.parentElement.classList.add('critical');
            } else if (this.currentMoveTimer < 30) {
                countdownElement.parentElement.classList.add('warning');
            } else {
                countdownElement.parentElement.classList.remove('critical', 'warning');
            }

            if (this.currentMoveTimer <= 0) {
                this.executeMoveByVote();
            }
        }, 1000);
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

                const piece = board[row][col];
                if (piece) {
                    const key = `${piece.color}_${piece.type}`;
                    square.textContent = pieceMap[key] || '';
                }

                square.addEventListener('click', () => this.handleSquareClick(row, col));
                boardElement.appendChild(square);
            }
        }

        const currentTeam = this.chess.currentPlayer === 'white' ? '⚪ White' : '⚫ Black';
        document.getElementById('current-player-team').textContent = currentTeam + ' to Move';
    }

    handleSquareClick(row, col) {
        if (!this.gameActive) return;
        if (this.chess.currentPlayer !== this.playerTeam) {
            alert("It's not your team's turn!");
            return;
        }

        const piece = this.chess.board[row][col];

        if (!this.selectedSquare) {
            if (piece && piece.color === this.playerTeam) {
                this.selectedSquare = [row, col];
            }
        } else {
            // Try to make the move for voting
            if (this.selectedSquare[0] === row && this.selectedSquare[1] === col) {
                this.selectedSquare = null;
            } else if (this.chess.isValidMove(this.selectedSquare, [row, col], this.playerTeam)) {
                this.playerVote = {
                    from: this.selectedSquare,
                    to: [row, col]
                };
                this.submitVote();
                this.selectedSquare = null;
            }
        }

        this.renderBoard();
        this.updateVoteDisplay();
    }

    updateVoteDisplay() {
        const voteDisplay = document.getElementById('vote-display');
        const submitBtn = document.getElementById('submit-vote-btn');

        if (this.playerVote) {
            const [fromRow, fromCol] = this.playerVote.from;
            const [toRow, toCol] = this.playerVote.to;
            const fromSquare = String.fromCharCode(97 + fromCol) + (8 - fromRow);
            const toSquare = String.fromCharCode(97 + toCol) + (8 - toRow);

            voteDisplay.innerHTML = `<strong>${fromSquare}</strong> → <strong>${toSquare}</strong>`;
            voteDisplay.classList.add('has-vote');
            submitBtn.disabled = false;
        } else {
            voteDisplay.innerHTML = '<p>No vote yet</p>';
            voteDisplay.classList.remove('has-vote');
            submitBtn.disabled = true;
        }
    }

    submitVote() {
        if (!this.playerVote) {
            alert('Please select a move first');
            return;
        }

        // Simulate sending vote to server
        this.simulateTopVotes();

        // Show confirmation
        const [fromRow, fromCol] = this.playerVote.from;
        const [toRow, toCol] = this.playerVote.to;
        const fromSquare = String.fromCharCode(97 + fromCol) + (8 - fromRow);
        const toSquare = String.fromCharCode(97 + toCol) + (8 - toRow);

        console.log(`Vote submitted: ${fromSquare} → ${toSquare}`);
    }

    simulateTopVotes() {
        // Simulate live voting results
        const topVotesList = document.getElementById('top-votes-list');
        topVotesList.innerHTML = '';

        // Generate some example votes
        const exampleVotes = [
            { move: 'e2-e4', count: 234 },
            { move: 'e2-e3', count: 187 },
            { move: 'd2-d4', count: 156 },
            { move: 'c2-c4', count: 112 }
        ];

        exampleVotes.forEach(vote => {
            const voteItem = document.createElement('div');
            voteItem.className = 'vote-item';
            voteItem.innerHTML = `
                <span class="vote-move">${vote.move}</span>
                <span class="vote-count">${vote.count} votes</span>
            `;
            topVotesList.appendChild(voteItem);
        });
    }

    executeMoveByVote() {
        // In production, execute the move with the highest vote count
        // For now, simulate a random valid move
        clearInterval(this.timerInterval);

        const validMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.chess.board[row][col];
                if (piece && piece.color === this.chess.currentPlayer) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.chess.isValidMove([row, col], [toRow, toCol], this.chess.currentPlayer)) {
                                validMoves.push({ from: [row, col], to: [toRow, toCol] });
                            }
                        }
                    }
                }
            }
        }

        if (validMoves.length > 0) {
            const selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
            this.chess.makeMove(selectedMove.from, selectedMove.to);
            this.moveNumber++;

            // Check for game end
            const status = this.chess.getGameStatus();
            if (status.status !== 'playing') {
                this.endGame(status);
            } else {
                this.playerVote = null;
                this.selectedSquare = null;
                this.renderBoard();
                document.getElementById('move-number').textContent = this.moveNumber;
                this.startMoveTimer();
            }
        }
    }

    endGame(status) {
        this.gameActive = false;
        clearInterval(this.timerInterval);

        const winner = status.winner;
        const youWin = winner === this.playerTeam;
        const title = status.status === 'checkmate' ?
            (youWin ? '✨ Your Team Won!' : 'Your Team Lost') :
            'Game Ended in Draw';

        document.getElementById('game-over-title').textContent = title;
        document.getElementById('game-over-message').textContent = 
            status.status === 'checkmate' ? 'Checkmate!' : 'Stalemate';

        document.getElementById('result-team-name').textContent = 
            (youWin ? '✓ Your Team' : 'Other Team') + ' ' + (youWin ? 'Won!' : 'Won');
        document.getElementById('result-status').textContent = 
            youWin ? '🏆 Victory' : '❌ Defeat';

        document.getElementById('total-moves').textContent = this.moveNumber;
        document.getElementById('your-votes').textContent = Math.floor(Math.random() * 20) + 5;
        document.getElementById('winning-votes').textContent = Math.floor(Math.random() * 15) + 3;

        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.add('active');
    }

    exitGame() {
        if (this.gameActive) {
            if (!confirm('Game in progress. Exit and forfeit?')) {
                return;
            }
        }
        clearInterval(this.timerInterval);
        this.gameActive = false;
        this.goBackToGameSelect();
    }

    goBackToGameSelect() {
        document.getElementById('game-screen').classList.remove('active');
        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-select-screen').classList.add('active');
        this.playerVote = null;
        this.selectedSquare = null;
    }

    playAgain() {
        this.chess.resetBoard();
        this.playerVote = null;
        this.selectedSquare = null;
        this.gameActive = false;
        clearInterval(this.timerInterval);

        document.getElementById('game-over-screen').classList.remove('active');
        document.getElementById('game-select-screen').classList.add('active');
    }
}

let game;

function selectWorldGame(timeSeconds) {
    game.selectWorldGame(timeSeconds);
}

function submitVote() {
    game.submitVote();
}

function exitGame() {
    game.exitGame();
}

function selectNewGame() {
    game.playAgain();
}

function goBackToMenu() {
    window.location.href = '../index.html';
}

function goBack() {
    window.location.href = '../index.html';
}

document.addEventListener('DOMContentLoaded', () => {
    game = new WorldChessGame();
});
