/**
 * Chess Engine - Handles all chess logic including board management and move validation
 */

class ChessBoard {
    constructor() {
        this.board = this.initializeBoard();
        this.moveHistory = [];
        this.currentPlayer = 'white';
        // Track if kings and rooks have moved for castling
        this.hasKingMoved = { white: false, black: false };
        this.hasRookMoved = {
            white: { kingside: false, queenside: false },
            black: { kingside: false, queenside: false }
        };
        // Track last pawn double move for en passant
        this.lastPawnDoubleMove = null; // { from, to, color, moveNumber }
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

        // First check if the piece move itself is valid
        if (!this.validatePieceMove(piece, from, to)) return false;
        
        // Now check if this move would leave the king in check
        // Make the move temporarily
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;
        
        // Check if king is in check after this move
        const kingInCheck = this.isInCheck(color);
        
        // Undo the move
        this.board[fromRow][fromCol] = piece;
        this.board[toRow][toCol] = target;
        
        // Move is only valid if king is NOT in check
        return !kingInCheck;
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

        // Capture (normal diagonal)
        if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && this.board[toRow][toCol]) {
            return true;
        }

        // En passant: capture diagonally to empty square
        if (Math.abs(fromCol - toCol) === 1 && toRow === fromRow + direction && !this.board[toRow][toCol]) {
            if (this.lastPawnDoubleMove && 
                this.lastPawnDoubleMove.color !== color &&
                this.lastPawnDoubleMove.to[0] === fromRow &&  // Enemy pawn on same row as our pawn
                this.lastPawnDoubleMove.to[1] === toCol) {    // Enemy pawn in the column we're capturing
                return true;
            }
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

        // Normal king move (1 square in any direction)
        if (Math.abs(fromRow - toRow) <= 1 && Math.abs(fromCol - toCol) <= 1) {
            return true;
        }

        // Castling: king moves 2 squares horizontally
        if (fromRow === toRow && Math.abs(fromCol - toCol) === 2) {
            return this.isValidCastling(from, to);
        }

        return false;
    }

    isValidCastling(kingFrom, kingTo) {
        const [kingRow, kingCol] = kingFrom;
        const [toRow, toCol] = kingTo;
        const color = this.board[kingRow][kingCol].color;

        // King must not have moved
        if (this.hasKingMoved[color]) return false;

        // Must be on back rank
        const backRank = color === 'white' ? 7 : 0;
        if (kingRow !== backRank || toRow !== backRank) return false;

        // King can't be in check
        if (this.isInCheck(color)) return false;

        // Determine which side and rook position
        const isKingside = toCol > kingCol;
        const rookCol = isKingside ? 7 : 0;
        const rook = this.board[kingRow][rookCol];

        // Rook must exist and not have moved
        if (!rook || rook.type !== 'rook') return false;
        if (this.hasRookMoved[color][isKingside ? 'kingside' : 'queenside']) return false;

        // Path must be clear between king and rook
        const startCol = Math.min(kingCol, rookCol);
        const endCol = Math.max(kingCol, rookCol);
        for (let col = startCol + 1; col < endCol; col++) {
            if (this.board[kingRow][col]) return false;
        }

        // King can't move through check
        const kingMoveCol = isKingside ? kingCol + 1 : kingCol - 1;
        if (this.wouldBeInCheck([kingRow, kingCol], [kingRow, kingMoveCol], color)) {
            return false;
        }

        return true;
    }

    wouldBeInCheck(from, to, color) {
        // Simulate the move
        const piece = this.board[from[0]][from[1]];
        const captured = this.board[to[0]][to[1]];

        this.board[to[0]][to[1]] = piece;
        this.board[from[0]][from[1]] = null;

        const inCheck = this.isInCheck(color);

        // Undo the move
        this.board[from[0]][from[1]] = piece;
        this.board[to[0]][to[1]] = captured;

        return inCheck;
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
        const [fromRow, fromCol] = from;
        const piece = this.board[fromRow][fromCol];
        
        if (!piece) return false;
        
        // For opponent moves received via API, the piece color determines whose move it is
        // For local moves, verify it's the current player's piece
        const moveColor = piece.color;
        if (moveColor !== this.currentPlayer) {
            // This is likely an opponent's move from the API - validate it's for the opponent
            // Don't reject it, just validate the move itself
        }
        
        if (!this.isValidMove(from, to, moveColor)) return false;

        const [toRow, toCol] = to;
        const color = moveColor;
        const isEnPassantCapture = piece.type === 'pawn' && 
                                  this.lastPawnDoubleMove && 
                                  this.lastPawnDoubleMove.color !== color &&
                                  this.lastPawnDoubleMove.to[0] === fromRow &&
                                  this.lastPawnDoubleMove.to[1] === toCol;

        // Move piece
        this.board[toRow][toCol] = piece;
        this.board[fromRow][fromCol] = null;

        // Track king moves for castling
        if (piece.type === 'king') {
            this.hasKingMoved[color] = true;

            // Handle castling: move rook if king moves 2 squares
            if (Math.abs(fromCol - toCol) === 2) {
                const isKingside = toCol > fromCol;
                const rookFromCol = isKingside ? 7 : 0;
                const rookToCol = isKingside ? 5 : 3;
                this.board[toRow][rookToCol] = this.board[toRow][rookFromCol];
                this.board[toRow][rookFromCol] = null;
                this.hasRookMoved[color][isKingside ? 'kingside' : 'queenside'] = true;
            }
        }

        // Track rook moves for castling
        if (piece.type === 'rook') {
            if (fromCol === 0) {
                this.hasRookMoved[color]['queenside'] = true;
            } else if (fromCol === 7) {
                this.hasRookMoved[color]['kingside'] = true;
            }
        }

        // Handle en passant capture
        if (isEnPassantCapture) {
            // Remove the captured pawn
            this.board[fromRow][toCol] = null;
            // Clear en passant after capture
            this.lastPawnDoubleMove = null;
        } else if (piece.type !== 'pawn' || Math.abs(fromRow - toRow) !== 2) {
            // If this is NOT a pawn double move, clear en passant
            // This means: any move except a 2-square pawn advance clears en passant
            this.lastPawnDoubleMove = null;
        }

        // Track pawn double moves for en passant
        if (piece.type === 'pawn' && Math.abs(fromRow - toRow) === 2) {
            this.lastPawnDoubleMove = { from, to, color, moveNumber: this.moveHistory.length };
        }

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
                    // Check if opponent piece can attack the king (without validating king safety for opponent)
                    // This prevents infinite recursion and correctly identifies check
                    if (this.validatePieceMove(piece, [row, col], kingPos)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    hasLegalMoves(color) {
        const legalMoves = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = this.board[row][col];
                if (piece && piece.color === color) {
                    for (let toRow = 0; toRow < 8; toRow++) {
                        for (let toCol = 0; toCol < 8; toCol++) {
                            if (this.isValidMove([row, col], [toRow, toCol], color)) {
                                legalMoves.push({
                                    from: [row, col],
                                    to: [toRow, toCol],
                                    piece: piece.type
                                });
                            }
                        }
                    }
                }
            }
        }
        if (legalMoves.length > 0) {
            console.log(`${color} Legal Moves:`, legalMoves);
        }
        return legalMoves.length > 0;
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
    // Called when receiving opponent moves via API to sync en passant tracking
    setSyncedPawnDoubleMove(moveData) {
        if (moveData && moveData.is_pawn_double_move) {
            this.lastPawnDoubleMove = {
                from: moveData.from,
                to: moveData.to,
                color: this.currentPlayer === 'white' ? 'black' : 'white'
            };
        }
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
