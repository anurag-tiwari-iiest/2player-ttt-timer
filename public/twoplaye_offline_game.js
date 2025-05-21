let board = ["", "", "", "", "", "", "", "", ""];
let currentPlayer = "X";
let gameActive = true;

let xMoves = [];
let oMoves = [];

function handleCellPlayed(cellIndex) {
  board[cellIndex] = currentPlayer;
  const cell = document.querySelectorAll('.game-board div')[cellIndex];
  cell.textContent = currentPlayer;
  cell.classList.remove("faded");

  let playerMoves = currentPlayer === "X" ? xMoves : oMoves;
  playerMoves.push(cellIndex);

  // Remove oldest if more than 3
  if (playerMoves.length > 3) {
    const removedIndex = playerMoves.shift();
    removeOldestMove(removedIndex);
  }

  const winner = checkWinner();
  if (winner) {
    gameActive = false;
    updateTurnIndicator(winner);
  } else {
    currentPlayer = currentPlayer === "X" ? "O" : "X"; // Switch player
    updateTurnIndicator();
    updateFading(); // Update fade for the next player
  }
}

function updateFading() {
  // Clear all faded styles first
  document.querySelectorAll('.game-board div').forEach(cell => {
    cell.classList.remove("faded");
  });

  // Apply fading only if current player has 3 moves
  const playerMoves = currentPlayer === "X" ? xMoves : oMoves;

  if (playerMoves.length === 3) {
    fadeOldestMove(playerMoves[0]);
  }
}

function updateTurnIndicator(winner = null) {
    const turnDisplay = document.getElementById("turn-indicator");

    if (winner === "Tie") {
        turnDisplay.innerHTML = "🤝 <strong>It's a Tie!</strong>";
        turnDisplay.classList.add("end-message");
    } else if (winner === "X" || winner === "O") {
        turnDisplay.innerHTML = `🏆 <strong>${winner} Won!</strong>`;
        turnDisplay.classList.add("end-message");
    } else {
        turnDisplay.textContent = `${currentPlayer}'s Turn`;
        turnDisplay.classList.remove("end-message");
    }
}

function fadeOldestMove(index) {
  const cell = document.querySelectorAll('.game-board div')[index];
  cell.classList.add("faded");
}

function removeOldestMove(index) {
  board[index] = "";
  const cell = document.querySelectorAll('.game-board div')[index];
  cell.textContent = "";
  cell.classList.remove("faded");
}

function checkWinner() {
  const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const playerMoves = currentPlayer === "X" ? xMoves.slice() : oMoves.slice();

  // Only consider the last 3 moves
  if (playerMoves.length > 3) {
    playerMoves.shift(); // Ensure we only check the 3 newest
  }

  for (let combo of winningCombinations) {
    if (combo.every(index => playerMoves.includes(index))) {
      return currentPlayer;
    }
  }

  if (board.every(cell => cell !== "")) {
    return "Tie";
  }

  return null;
}

function resetGame() {
  board = ["", "", "", "", "", "", "", "", ""];
  currentPlayer = "X";
  gameActive = true;
  xMoves = [];
  oMoves = [];

  document.querySelectorAll('.game-board div').forEach(cell => {
    cell.textContent = "";
    cell.classList.remove("faded");
  });

  updateTurnIndicator();
  updateFading(); // Show initial fading if needed
}

document.addEventListener("DOMContentLoaded", () => {
  const cells = document.querySelectorAll('.game-board div');
  const resetButton = document.getElementById('reset-btn');

  cells.forEach((cell, index) => {
    cell.addEventListener('click', () => {
      if (gameActive && board[index] === "") {
        handleCellPlayed(index);
      }
    });
  });

  resetButton.addEventListener('click', resetGame);

  updateFading(); // Initial call when game loads
});