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
   * Get best move using minimax algorithm
   */
  getBestMove() {
    let bestScore = -Infinity;
    let bestMove;

    const available = this.board
      .map((v, i) => v === '' ? i : null)
      .filter(v => v !== null);

    for (const i of available) {
      // Try move
      const boardCopy = [...this.board];
      boardCopy[i] = this.aiSymbol;
      
      let aiMovesCopy = [...(this.aiSymbol === 'O' ? this.oMoves : this.xMoves), i];
      if (aiMovesCopy.length > 3) aiMovesCopy = aiMovesCopy.slice(1);

      const score = this.minimax(
        boardCopy,
        this.aiSymbol === 'O' ? aiMovesCopy : this.xMoves,
        this.aiSymbol === 'X' ? aiMovesCopy : this.oMoves,
        0,
        false
      );

      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }

    return bestMove;
  }

  /**
   * Minimax algorithm
   */
  minimax(boardState, oState, xState, depth, isMax) {
    const winner = this.evalWinner(oState, xState);
    if (winner === this.aiSymbol) return 10 - depth;
    if (winner === this.playerSymbol) return depth - 10;
    if (boardState.every(cell => cell !== '')) return 0;

    const available = boardState
      .map((v, i) => v === '' ? i : null)
      .filter(i => i !== null);

    if (isMax) {
      let maxEval = -Infinity;
      for (const i of available) {
        boardState[i] = this.aiSymbol;
        let newMoves = this.aiSymbol === 'X' ? [...xState, i] : [...oState, i];
        if (newMoves.length > 3) newMoves = newMoves.slice(1);
        
        const evalScore = this.minimax(
          boardState,
          this.aiSymbol === 'O' ? newMoves : oState,
          this.aiSymbol === 'X' ? newMoves : xState,
          depth + 1,
          false
        );
        boardState[i] = '';
        maxEval = Math.max(maxEval, evalScore);
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const i of available) {
        boardState[i] = this.playerSymbol;
        let newMoves = this.playerSymbol === 'X' ? [...xState, i] : [...oState, i];
        if (newMoves.length > 3) newMoves = newMoves.slice(1);
        
        const evalScore = this.minimax(
          boardState,
          this.playerSymbol === 'O' ? newMoves : oState,
          this.playerSymbol === 'X' ? newMoves : xState,
          depth + 1,
          true
        );
        boardState[i] = '';
        minEval = Math.min(minEval, evalScore);
      }
      return minEval;
    }
  }

  /**
   * Evaluate winner from move states
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
