/**
 * AI Game Controller
 * Handles single player vs AI game logic with minimax algorithm
 */

class AIGame {
  constructor() {
    // Game state
    this.board = Array(9).fill('');
    this.xMoves = [];
    this.oMoves = [];
    this.currentPlayer = 'X';
    this.playerSymbol = 'X';
    this.aiSymbol = 'O';
    this.gameActive = false;
    
    // DOM elements
    this.elements = {};
    this.cells = [];
  }

  /**
   * Initialize the game
   */
  init() {
    this.cacheElements();
    this.createBoard();
    this.bindEvents();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      gameBoard: document.getElementById('game-board'),
      turnIndicator: document.getElementById('turn-indicator'),
      resetBtn: document.getElementById('reset-btn'),
      symbolSelection: document.getElementById('symbol-selection'),
      selectX: document.getElementById('select-x'),
      selectO: document.getElementById('select-o')
    };
  }

  /**
   * Create the game board
   */
  createBoard() {
    this.elements.gameBoard.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.index = i;
      this.elements.gameBoard.appendChild(cell);
    }
    this.cells = Array.from(this.elements.gameBoard.querySelectorAll('div'));
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Symbol selection
    this.elements.selectX.addEventListener('click', () => this.startGame('X'));
    this.elements.selectO.addEventListener('click', () => this.startGame('O'));

    // Cell clicks
    this.cells.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });

    // Reset button
    this.elements.resetBtn.addEventListener('click', () => this.resetGame());
  }

  /**
   * Start the game with selected symbol
   */
  startGame(symbol) {
    this.playerSymbol = symbol;
    this.aiSymbol = symbol === 'X' ? 'O' : 'X';
    this.currentPlayer = 'X';
    this.gameActive = true;

    // Hide symbol selection, show game
    this.elements.symbolSelection.style.display = 'none';
    this.elements.gameBoard.style.display = 'grid';
    this.elements.turnIndicator.style.display = 'block';
    this.elements.resetBtn.style.display = 'inline-block';

    this.updateTurnIndicator();

    // If AI goes first
    if (this.currentPlayer === this.aiSymbol) {
      setTimeout(() => this.makeAIMove(), 500);
    }
  }

  /**
   * Handle cell click
   */
  handleCellClick(index) {
    if (!this.gameActive || this.board[index] !== '' || this.currentPlayer !== this.playerSymbol) {
      return;
    }

    this.makeMove(index);

    const winner = this.checkWinner();
    if (winner) {
      this.gameActive = false;
      this.showResult(winner);
      return;
    }

    // Switch to AI
    this.currentPlayer = this.aiSymbol;
    this.updateTurnIndicator();

    setTimeout(() => {
      this.makeAIMove();
      
      const winner = this.checkWinner();
      if (winner) {
        this.gameActive = false;
        this.showResult(winner);
        return;
      }

      this.currentPlayer = this.playerSymbol;
      this.updateTurnIndicator();
    }, 800);
  }

  /**
   * Make a move
   */
  makeMove(index) {
    this.board[index] = this.currentPlayer;
    
    const cell = this.cells[index];
    cell.textContent = this.currentPlayer;
    cell.classList.remove('faded', 'cell-o');
    if (this.currentPlayer === 'O') {
      cell.classList.add('cell-o');
    }

    const moves = this.currentPlayer === 'X' ? this.xMoves : this.oMoves;
    moves.push(index);

    // Handle disappearing move
    if (moves.length > 3) {
      const removedIndex = moves.shift();
      this.board[removedIndex] = '';
      const removedCell = this.cells[removedIndex];
      removedCell.textContent = '';
      removedCell.classList.remove('faded', 'cell-o');
    }

    this.updateFading();
  }

  /**
   * Make AI move using minimax
   */
  makeAIMove() {
    const bestMove = this.getBestMove();
    if (bestMove !== undefined && this.board[bestMove] === '') {
      this.makeMove(bestMove);
    }
  }

  /**
   * Get best move using minimax algorithm with vanishing move awareness.
   * 
   * Key insight: The AI remembers which opponent move is going to disappear,
   * allowing it to exploit situations where a blocking piece will vanish.
   */
  getBestMove() {
    let bestScore = -Infinity;
    let bestMove;

    const available = this.board
      .map((v, i) => v === '' ? i : null)
      .filter(v => v !== null);

    // Get current move states
    const currentOState = [...this.oMoves];
    const currentXState = [...this.xMoves];

    for (const i of available) {
      // Simulate AI making this move
      const boardCopy = [...this.board];
      boardCopy[i] = this.aiSymbol;
      
      // Track moves and handle vanishing
      let newOState = [...currentOState];
      let newXState = [...currentXState];
      
      if (this.aiSymbol === 'O') {
        newOState.push(i);
        if (newOState.length > 3) {
          const vanishing = newOState.shift();
          boardCopy[vanishing] = '';
        }
      } else {
        newXState.push(i);
        if (newXState.length > 3) {
          const vanishing = newXState.shift();
          boardCopy[vanishing] = '';
        }
      }

      const score = this.minimax(boardCopy, newOState, newXState, 0, false);

      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }

    return bestMove;
  }

  /**
   * Minimax algorithm with alpha-beta pruning and vanishing move tracking.
   * 
   * Alpha-beta pruning dramatically reduces the search space by cutting off
   * branches that can't possibly affect the final decision.
   * 
   * @param {Array} boardState - Current board state
   * @param {Array} oState - O's move history (oldest first)
   * @param {Array} xState - X's move history (oldest first)
   * @param {number} depth - Current search depth
   * @param {boolean} isMax - Is this the maximizing player's turn?
   * @param {number} alpha - Best score the maximizer can guarantee
   * @param {number} beta - Best score the minimizer can guarantee
   */
  minimax(boardState, oState, xState, depth, isMax, alpha = -Infinity, beta = Infinity) {
    // Check for winner
    const winner = this.evalWinner(oState, xState);
    if (winner === this.aiSymbol) return 100 - depth;  // Prefer quicker wins
    if (winner === this.playerSymbol) return depth - 100;  // Prefer longer losses

    // Depth limit - 5 is plenty for TTT with good heuristics
    if (depth >= 5) {
      return this.evaluatePosition(oState, xState);
    }

    const available = boardState
      .map((v, i) => v === '' ? i : null)
      .filter(i => i !== null);

    // If no moves available, evaluate position
    if (available.length === 0) {
      return this.evaluatePosition(oState, xState);
    }

    if (isMax) {
      // AI's turn (maximizing)
      let maxEval = -Infinity;
      for (const i of available) {
        const newBoard = [...boardState];
        newBoard[i] = this.aiSymbol;
        
        // Handle vanishing for AI
        let newOState = [...oState];
        let newXState = [...xState];
        
        if (this.aiSymbol === 'O') {
          newOState.push(i);
          if (newOState.length > 3) {
            const vanishing = newOState.shift();
            newBoard[vanishing] = '';
          }
        } else {
          newXState.push(i);
          if (newXState.length > 3) {
            const vanishing = newXState.shift();
            newBoard[vanishing] = '';
          }
        }
        
        const evalScore = this.minimax(newBoard, newOState, newXState, depth + 1, false, alpha, beta);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        
        // Beta cutoff - minimizer won't allow this path
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      // Player's turn (minimizing)
      let minEval = Infinity;
      for (const i of available) {
        const newBoard = [...boardState];
        newBoard[i] = this.playerSymbol;
        
        // Handle vanishing for player
        let newOState = [...oState];
        let newXState = [...xState];
        
        if (this.playerSymbol === 'O') {
          newOState.push(i);
          if (newOState.length > 3) {
            const vanishing = newOState.shift();
            newBoard[vanishing] = '';
          }
        } else {
          newXState.push(i);
          if (newXState.length > 3) {
            const vanishing = newXState.shift();
            newBoard[vanishing] = '';
          }
        }
        
        const evalScore = this.minimax(newBoard, newOState, newXState, depth + 1, true, alpha, beta);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        
        // Alpha cutoff - maximizer won't allow this path
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  /**
   * Evaluate position heuristically when depth limit reached.
   * 
   * This considers:
   * - How close each player is to winning
   * - Which moves are about to vanish and their strategic importance
   * - Control of center and corners
   */
  evaluatePosition(oState, xState) {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    let score = 0;
    
    // Get active moves (last 3 for each player)
    const oActive = new Set(oState.slice(-3));
    const xActive = new Set(xState.slice(-3));
    
    const aiActive = this.aiSymbol === 'O' ? oActive : xActive;
    const playerActive = this.playerSymbol === 'O' ? oActive : xActive;
    
    // Identify vanishing moves (oldest move if at 3 moves)
    const aiVanishing = (this.aiSymbol === 'O' ? oState : xState).length >= 3 
      ? (this.aiSymbol === 'O' ? oState : xState)[0] 
      : -1;
    const playerVanishing = (this.playerSymbol === 'O' ? oState : xState).length >= 3 
      ? (this.playerSymbol === 'O' ? oState : xState)[0] 
      : -1;

    for (const pattern of winPatterns) {
      const aiCount = pattern.filter(i => aiActive.has(i)).length;
      const playerCount = pattern.filter(i => playerActive.has(i)).length;

      // Score for AI
      if (playerCount === 0) {
        if (aiCount === 2) {
          score += 10;
          // Bonus if this line doesn't include AI's vanishing move
          if (!pattern.includes(aiVanishing)) score += 5;
        } else if (aiCount === 1) {
          score += 1;
        }
      }

      // Score against player
      if (aiCount === 0) {
        if (playerCount === 2) {
          score -= 10;
          // Reduce threat if player's vanishing move is in this line
          // (the threat will resolve itself when that piece disappears)
          if (pattern.includes(playerVanishing)) score += 4;
        } else if (playerCount === 1) {
          score -= 1;
        }
      }
    }

    // Bonus for controlling center
    if (aiActive.has(4)) score += 3;
    if (playerActive.has(4)) score -= 3;

    // Bonus for corners
    const corners = [0, 2, 6, 8];
    score += corners.filter(c => aiActive.has(c)).length * 2;
    score -= corners.filter(c => playerActive.has(c)).length * 2;

    return score;
  }

  /**
   * Evaluate winner from move states (only considers active moves)
   */
  evalWinner(oState, xState) {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    const oLast3 = oState.slice(-3);
    const xLast3 = xState.slice(-3);

    for (const pattern of winPatterns) {
      if (pattern.every(i => oLast3.includes(i))) return 'O';
      if (pattern.every(i => xLast3.includes(i))) return 'X';
    }
    return null;
  }

  /**
   * Update fading display
   */
  updateFading() {
    this.cells.forEach(cell => cell.classList.remove('faded'));

    const fadingMoves = this.currentPlayer === 'X' ? this.oMoves : this.xMoves;
    if (fadingMoves.length === 3) {
      this.cells[fadingMoves[0]].classList.add('faded');
    }
  }

  /**
   * Check for winner
   */
  checkWinner() {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    const xLast3 = this.xMoves.slice(-3);
    const oLast3 = this.oMoves.slice(-3);

    for (const pattern of winPatterns) {
      if (pattern.every(i => xLast3.includes(i))) return 'X';
      if (pattern.every(i => oLast3.includes(i))) return 'O';
    }

    return null;
  }

  /**
   * Update turn indicator
   */
  updateTurnIndicator() {
    const isPlayerTurn = this.currentPlayer === this.playerSymbol;
    this.elements.turnIndicator.innerHTML = isPlayerTurn 
      ? `⚔️ <strong>Your Turn</strong>` 
      : `🤖 <strong>AI Thinking...</strong>`;
    this.elements.turnIndicator.classList.remove('end-message');
  }

  /**
   * Show result
   */
  showResult(winner) {
    const isPlayerWin = winner === this.playerSymbol;
    if (winner === 'Tie') {
      this.elements.turnIndicator.innerHTML = "🤝 <strong>It's a Draw!</strong>";
    } else if (isPlayerWin) {
      this.elements.turnIndicator.innerHTML = `🏆 <strong>You Win!</strong>`;
    } else {
      this.elements.turnIndicator.innerHTML = `🤖 <strong>AI Wins!</strong>`;
    }
    this.elements.turnIndicator.classList.add('end-message');
  }

  /**
   * Reset the game
   */
  resetGame() {
    this.board = Array(9).fill('');
    this.xMoves = [];
    this.oMoves = [];
    this.currentPlayer = 'X';
    this.gameActive = true;

    this.cells.forEach(cell => {
      cell.textContent = '';
      cell.classList.remove('faded', 'cell-o');
    });

    this.updateTurnIndicator();

    // If AI goes first
    if (this.currentPlayer === this.aiSymbol) {
      setTimeout(() => this.makeAIMove(), 500);
    }
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const game = new AIGame();
  game.init();
});
