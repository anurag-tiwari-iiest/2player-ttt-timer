let board = Array(9).fill("");
let gameActive = false;
let xMoves = [];
let oMoves = [];
let currentPlayer = "X";
let playerSymbol = "X";
let aiSymbol = "O";

document.addEventListener("DOMContentLoaded", () => {
  const boardContainer = document.getElementById("game-board");
  const resetBtn = document.getElementById("reset-btn");
  const turnIndicator = document.getElementById("turn-indicator");

  // Setup board cells
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    boardContainer.appendChild(cell);
  }

  const cells = document.querySelectorAll(".game-board div");

  // Symbol selection
  document.getElementById("select-x").addEventListener("click", () => startGame("X"));
  document.getElementById("select-o").addEventListener("click", () => startGame("O"));

  // Cell click events
  cells.forEach((cell, index) => {
    cell.addEventListener("click", () => {
      if (gameActive && board[index] === "" && currentPlayer === playerSymbol) {
        handleMove(index);
        const winner = checkWinner();
        if (winner) {
          gameActive = false;
          updateTurnIndicator(winner);
          return;
        }
        currentPlayer = aiSymbol;
        updateTurnIndicator();
        setTimeout(() => {
          makeAIMove();
          const winner = checkWinner();
          if (winner) {
            gameActive = false;
            updateTurnIndicator(winner);
            return;
          }
          currentPlayer = playerSymbol;
          updateTurnIndicator();
        }, 800);
      }
    });
  });

  resetBtn.addEventListener("click", resetGame);
});

function startGame(symbol) {
  playerSymbol = symbol;
  aiSymbol = symbol === "X" ? "O" : "X";
  currentPlayer = "X";
  gameActive = true;

  document.getElementById("symbol-selection").style.display = "none";
  document.getElementById("game-board").style.display = "grid";
  document.getElementById("turn-indicator").style.display = "block";
  document.getElementById("reset-btn").style.display = "inline-block";

  updateTurnIndicator();
  updateFading();

  // If AI starts first
  if (currentPlayer === aiSymbol) {
    setTimeout(() => {
      makeAIMove();
      currentPlayer = playerSymbol;
      updateTurnIndicator();
    }, 500);
  }
}

function handleMove(index) {
  board[index] = currentPlayer;
  const cell = document.querySelectorAll(".game-board div")[index];
  cell.textContent = currentPlayer;
  cell.classList.remove("faded");

  const moves = currentPlayer === "X" ? xMoves : oMoves;
  moves.push(index);

  if (moves.length > 3) {
    const removed = moves.shift();
    board[removed] = "";
    const removedCell = document.querySelectorAll(".game-board div")[removed];
    removedCell.textContent = "";
    removedCell.classList.remove("faded");
  }

  updateFading();
}

function updateTurnIndicator(winner = null) {
  const indicator = document.getElementById("turn-indicator");
  if (winner === "Tie") {
    indicator.innerHTML = "🤝 <strong>It's a Tie!</strong>";
    indicator.classList.add("end-message");
  } else if (winner) {
    indicator.innerHTML = `🏆 <strong>${winner} Won!</strong>`;
    indicator.classList.add("end-message");
  } else {
    indicator.textContent = `${currentPlayer}'s Turn`;
    indicator.classList.remove("end-message");
  }
}

function updateFading() {
  document.querySelectorAll(".game-board div").forEach(cell => {
    cell.classList.remove("faded");
  });

  const fading = currentPlayer === "X" ? oMoves : xMoves;
  if (fading.length === 3) {
    const cell = document.querySelectorAll(".game-board div")[fading[0]];
    cell.classList.add("faded");
  }
}

function checkWinner() {
  const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  const moves = currentPlayer === "X" ? xMoves.slice(-3) : oMoves.slice(-3);

  for (let combo of winCombos) {
    if (combo.every(i => moves.includes(i))) {
      return currentPlayer;
    }
  }

  if (board.every(cell => cell !== "")) return "Tie";
  return null;
}

function resetGame() {
  board = ["", "", "", "", "", "", "", "", ""];
  currentPlayer = "X";
  xMoves = [];
  oMoves = [];
  gameActive = true;

  document.querySelectorAll(".game-board div").forEach(cell => {
    cell.textContent = "";
    cell.classList.remove("faded");
  });

  updateTurnIndicator();

  // Let AI start if it's AI's turn
  if (currentPlayer === aiSymbol) {
    setTimeout(() => {
      makeAIMove();
      currentPlayer = playerSymbol;
      updateTurnIndicator();
    }, 500);
  }
}

function makeAIMove() {
  const bestMove = getBestMove([...board], [...oMoves], [...xMoves]);
  if (bestMove !== undefined && board[bestMove] === "") {
    handleMove(bestMove);
  }
}

function getBestMove(currentBoard, currentO, currentX) {
  const isAI_X = aiSymbol === "X";
  let bestScore = -Infinity;
  let move;

  const available = currentBoard.map((v, i) => v === "" ? i : null).filter(v => v !== null);

  for (let i of available) {
    currentBoard[i] = aiSymbol;
    let newO = [...(aiSymbol === "O" ? currentO : currentX), i];
    if (newO.length > 3) newO = newO.slice(1);

    let score = minimax(
      currentBoard,
      aiSymbol === "O" ? newO : currentO,
      aiSymbol === "X" ? newO : currentX,
      0,
      false
    );
    currentBoard[i] = "";

    if (score > bestScore) {
      bestScore = score;
      move = i;
    }
  }

  return move;
}

function minimax(boardState, oState, xState, depth, isMax) {
  const winner = evalWinner(oState, xState);
  if (winner === aiSymbol) return 10 - depth;
  if (winner === playerSymbol) return depth - 10;
  if (boardState.every(cell => cell !== "")) return 0;

  const avail = boardState.map((v, i) => v === "" ? i : null).filter(i => i !== null);

  if (isMax) {
    let maxEval = -Infinity;
    for (let i of avail) {
      boardState[i] = aiSymbol;
      let newMoves = aiSymbol === "X" ? [...xState, i] : [...oState, i];
      if (newMoves.length > 3) newMoves = newMoves.slice(1);
      let eval = minimax(
        boardState,
        aiSymbol === "O" ? newMoves : oState,
        aiSymbol === "X" ? newMoves : xState,
        depth + 1,
        false
      );
      boardState[i] = "";
      maxEval = Math.max(maxEval, eval);
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let i of avail) {
      boardState[i] = playerSymbol;
      let newMoves = playerSymbol === "X" ? [...xState, i] : [...oState, i];
      if (newMoves.length > 3) newMoves = newMoves.slice(1);
      let eval = minimax(
        boardState,
        playerSymbol === "O" ? newMoves : oState,
        playerSymbol === "X" ? newMoves : xState,
        depth + 1,
        true
      );
      boardState[i] = "";
      minEval = Math.min(minEval, eval);
    }
    return minEval;
  }
}

function evalWinner(oState, xState) {
  const winCombos = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (let combo of winCombos) {
    if (combo.every(i => oState.includes(i))) return "O";
    if (combo.every(i => xState.includes(i))) return "X";
  }
  return null;
}
