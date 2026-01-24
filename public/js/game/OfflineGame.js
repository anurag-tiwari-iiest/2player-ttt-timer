/**
 * Offline Two-Player Game Controller
 * Handles local multiplayer game logic
 */

class OfflineGame {
  constructor() {
    // Game state
    this.board = Array(9).fill('');
    this.xMoves = [];
    this.oMoves = [];
    this.currentPlayer = 'X';
    this.gameActive = true;
    
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
    this.updateTurnIndicator();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      gameBoard: document.getElementById('game-board'),
      turnIndicator: document.getElementById('turn-indicator'),
      resetBtn: document.getElementById('reset-btn')
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
    // Cell clicks
    this.cells.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });

    // Reset button
    this.elements.resetBtn.addEventListener('click', () => this.resetGame());
  }

  /**
   * Handle cell click
   */
  handleCellClick(index) {
    if (!this.gameActive || this.board[index] !== '') {
      return;
    }

    this.makeMove(index);
  }

  /**
   * Make a move
   */
  makeMove(index) {
    // Update board
    this.board[index] = this.currentPlayer;
    
    // Update cell display
    const cell = this.cells[index];
    cell.textContent = this.currentPlayer;
    cell.classList.remove('faded', 'cell-o');
    if (this.currentPlayer === 'O') {
      cell.classList.add('cell-o');
    }

    // Track move
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

    // Check for winner
    const winner = this.checkWinner();
    if (winner) {
      this.gameActive = false;
      this.showResult(winner);
      return;
    }

    // Switch player
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.updateTurnIndicator();
    this.updateFading();
  }

  /**
   * Update fading for the current player's oldest move
   */
  updateFading() {
    // Clear all fading
    this.cells.forEach(cell => cell.classList.remove('faded'));

    // Apply fading to current player's oldest move if they have 3
    const moves = this.currentPlayer === 'X' ? this.xMoves : this.oMoves;
    if (moves.length === 3) {
      this.cells[moves[0]].classList.add('faded');
    }
  }

  /**
   * Check for winner
   */
  checkWinner() {
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    // Check X wins
    const xLast3 = this.xMoves.slice(-3);
    for (const pattern of winPatterns) {
      if (pattern.every(i => xLast3.includes(i))) {
        return 'X';
      }
    }

    // Check O wins
    const oLast3 = this.oMoves.slice(-3);
    for (const pattern of winPatterns) {
      if (pattern.every(i => oLast3.includes(i))) {
        return 'O';
      }
    }

    return null;
  }

  /**
   * Update turn indicator
   */
  updateTurnIndicator() {
    this.elements.turnIndicator.innerHTML = 
      `⚔️ <strong>${this.currentPlayer}</strong>'s Turn`;
    this.elements.turnIndicator.classList.remove('end-message');
  }

  /**
   * Show result
   */
  showResult(winner) {
    if (winner === 'Tie') {
      this.elements.turnIndicator.innerHTML = "🤝 <strong>It's a Draw!</strong>";
    } else {
      this.elements.turnIndicator.innerHTML = `🏆 <strong>${winner} Wins!</strong>`;
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
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const game = new OfflineGame();
  game.init();
});
