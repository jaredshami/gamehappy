/**
 * Chess Engine - Handles all chess logic including board management and move validation
 */

class ChessBoard {
    constructor() {
        this.board = this.initializeBoard();
        this.moveHistory = [];
        this.currentPlayer = 'white';
    }

    initializeBoard() {
        // 8x8 board with piece positions
        const board = Array(8).fill(null).map(() => Array(8).fill(null));
        
        // Place white pieces
        board[7][0] = { color: 'white', type: 'rook' };
        board[7][1] = { color: 'white', type: 'knight' };
        board[7][2] = { color: 'white', type: 'bishop' };
        board[7][3] = { color: 'white', type: 'queen' };
        board[7][4] = { color: 'white', type: 'king' };
        board[7][5] = { color: 'white', type: 'bishop' };
        board[7][6] = { color: 'white', type: 'knight' };
        board[7][7] = { color: 'white', type: 'rook' };
        for (let i = 0; i < 8; i++) {
            board[6][i] = { color: 'white', type: 'pawn' };
        }

        // Place black pieces
        board[0][0] = { color: 'black', type: 'rook' };
        board[0][1] = { color: 'black', type: 'knight' };
        board[0][2] = { color: 'black', type: 'bishop' };
        board[0][3] = { color: 'black', type: 'queen' };
        board[0][4] = { color: 'black', type: 'king' };
        board[0][5] = { color: 'black', type: 'bishop' };
        board[0][6] = { color: 'black', type: 'knight' };
        board[0][7] = { color: 'black', type: 'rook' };
        for (let i = 0; i < 8; i++) {
            board[1][i] = { color: 'black', type: 'pawn' };
        }

        return board;
    }

    isValidMove(from, to, color) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        const piece = this.board[fromRow][fromCol];
        if (!piece || piece.color !== color) return false;

        const target = this.board[toRow][toCol];
        if (target && target.color === color) return false;

        return this.validatePieceMove(piece, from, to);
    }

    validatePieceMove(piece, from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        switch (piece.type) {
            case 'pawn':
                return this.isValidPawnMove(from, to, piece.color);
            case 'rook':
                return this.isValidRookMove(from, to);
            case 'knight':
                return this.isValidKnightMove(from, to);
            case 'bishop':
                return this.isValidBishopMove(from, to);
            case 'queen':
                return this.isValidQueenMove(from, to);
            case 'king':
                return this.isValidKingMove(from, to);
            default:
                return false;
        }
    }

    isValidPawnMove(from, to, color) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const direction = color === 'white' ? -1 : 1;
        const startRow = color === 'white' ? 6 : 1;

        // Forward move
        if (fromCol === toCol && !this.board[toRow][toCol]) {
            if (toRow === fromRow + direction) return true;
            if (fromRow === startRow && toRow === fromRow + 2 * direction && !this.board[fromRow + direction][fromCol]) {
                return true;
            }
        }

        // Capture
        if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && this.board[toRow][toCol]) {
            return true;
        }

        return false;
    }

    isValidRookMove(from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        if (fromRow !== toRow && fromCol !== toCol) return false;
        return this.isPathClear(from, to);
    }

    isValidKnightMove(from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;
        const rowDiff = Math.abs(fromRow - toRow);
        const colDiff = Math.abs(fromCol - toCol);

        return (rowDiff === 2 && colDiff === 1) || (rowDiff === 1 && colDiff === 2);
    }

    isValidBishopMove(from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        if (Math.abs(fromRow - toRow) !== Math.abs(fromCol - toCol)) return false;
        return this.isPathClear(from, to);
    }

    isValidQueenMove(from, to) {
        return this.isValidRookMove(from, to) || this.isValidBishopMove(from, to);
    }

    isValidKingMove(from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        return Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1;
    }

    isPathClear(from, to) {
        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        const rowDir = Math.sign(toRow - fromRow);
        const colDir = Math.sign(toCol - fromCol);

        let row = fromRow + rowDir;
        let col = fromCol + colDir;

        while (row !== toRow || col !== toCol) {
            if (this.board[row][col]) return false;
            row += rowDir;
            col += colDir;
        }

        return true;
    }

    makeMove(from, to) {
        if (!this.isValidMove(from, to, this.currentPlayer)) return false;

        const [fromRow, fromCol] = from;
        const [toRow, toCol] = to;

        this.board[toRow][toCol] = this.board[fromRow][fromCol];
        this.board[fromRow][fromCol] = null;

        this.moveHistory.push({ from, to, timestamp: Date.now() });
        this.currentPlayer = this.currentPlayer === 'white' ? 'black' : 'white';

        return true;
    }

    isCheckmate(color) {
        if (!this.isInCheck(color)) return false;
        return !this.hasLegalMoves(color);
    }

    isStalemate(color) {
        if (this.isInCheck(color)) return false;
        return !this.hasLegalMoves(color);
    }

    isInCheck(color) {
        const kingPos = this.findKing(color);
        if (!kingPos) return false;

        const oppositeColor = color === 'white' ? 'black' : 'white';
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === oppositeColor) {
                    if (this.isValidMove([row, col], kingPos, oppositeColor)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    hasLegalMoves(color) {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove([row, col], [toRow, toCol], color)) {
                                return true;
                            }
                        }
                    }
                }
            }
        }
        return false;
    }

    findKing(color) {
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color && piece.type === 'king') {
                    return [row, col];
                }
            }
        }
        return null;
    }

    getGameStatus() {
        const whiteCheckmate = this.isCheckmate('white');
        const blackCheckmate = this.isCheckmate('black');
        const whiteStalemate = this.isStalemate('white');
        const blackStalemate = this.isStalemate('black');

        if (whiteCheckmate) return { status: 'checkmate', winner: 'black' };
        if (blackCheckmate) return { status: 'checkmate', winner: 'white' };
        if (whiteStalemate || blackStalemate) return { status: 'stalemate', winner: null };

        return { status: 'playing', winner: null };
    }

    resetBoard() {
        this.board = this.initializeBoard();
        this.moveHistory = [];
        this.currentPlayer = 'white';
    }

    getBoard() {
        return JSON.parse(JSON.stringify(this.board));
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChessBoard;
}
