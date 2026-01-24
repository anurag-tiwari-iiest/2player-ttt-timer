/**
 * Shared Game Utilities
 * Common functions used across game modes
 */

/**
 * Win patterns for tic-tac-toe
 */
const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

/**
 * Check for a winner based on move history
 * @param {number[]} moves - Array of move indices (max 3)
 * @returns {boolean} - Whether this player has won
 */
function checkWinFromMoves(moves) {
  const lastThreeMoves = moves.slice(-3);
  if (lastThreeMoves.length < 3) return false;
  
  return WIN_PATTERNS.some(pattern => 
    pattern.every(i => lastThreeMoves.includes(i))
  );
}

/**
 * Check for winner from board state
 * @param {string[]} board - Current board state
 * @param {number[]} xMoves - X player's moves
 * @param {number[]} oMoves - O player's moves
 * @returns {string|null} - Winner symbol or null
 */
function checkWinner(board, xMoves, oMoves) {
  if (checkWinFromMoves(xMoves)) return 'X';
  if (checkWinFromMoves(oMoves)) return 'O';
  return null;
}

/**
 * Create game board cells
 * @param {HTMLElement} container - Container element for the board
 * @param {number} size - Number of cells (default 9)
 */
function createBoardCells(container, size = 9) {
  container.innerHTML = '';
  for (let i = 0; i < size; i++) {
    const cell = document.createElement('div');
    cell.classList.add('cell');
    cell.dataset.index = i;
    container.appendChild(cell);
  }
}

/**
 * Update a cell's display
 * @param {HTMLElement} cell - Cell element
 * @param {string} symbol - 'X', 'O', or '' for empty
 */
function updateCellDisplay(cell, symbol) {
  cell.textContent = symbol;
  cell.classList.remove('cell-o', 'faded');
  if (symbol === 'O') {
    cell.classList.add('cell-o');
  }
}

/**
 * Clear a cell
 * @param {HTMLElement} cell - Cell element
 */
function clearCell(cell) {
  cell.textContent = '';
  cell.classList.remove('cell-o', 'faded');
}

/**
 * Apply fading effect to oldest move
 * @param {HTMLElement[]} cells - All cell elements
 * @param {number|null} fadingIndex - Index of cell to fade
 */
function applyFading(cells, fadingIndex) {
  // Remove all fading first
  cells.forEach(cell => cell.classList.remove('faded'));
  
  // Apply fading to specific cell
  if (fadingIndex !== null && fadingIndex >= 0 && fadingIndex < cells.length) {
    cells[fadingIndex].classList.add('faded');
  }
}

/**
 * Calculate which move should be faded
 * @param {number[]} moves - Current player's moves
 * @returns {number|null} - Index to fade or null
 */
function calculateFadingIndex(moves) {
  return moves.length === 3 ? moves[0] : null;
}

/**
 * Generate a 6-character room code
 * @returns {string} - Room code
 */
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

/**
 * Validate room code format
 * @param {string} code - Room code to validate
 * @returns {boolean} - Whether code is valid
 */
function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/.test(code?.toUpperCase() || '');
}

// Export for module use (if applicable)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WIN_PATTERNS,
    checkWinFromMoves,
    checkWinner,
    createBoardCells,
    updateCellDisplay,
    clearCell,
    applyFading,
    calculateFadingIndex,
    generateRoomCode,
    isValidRoomCode
  };
}
