let board = Array(9).fill("");
let gameActive = false;
let socket, roomID;
let playerSymbol = null;
let isMyTurn = false;
let xMoves = [];
let oMoves = [];
let timerInterval;
let timeLeft = 5;

document.addEventListener("DOMContentLoaded", () => {
  const gameBoard = document.getElementById("game-board");
  const giveUpButton = document.getElementById("giveup-btn");

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    gameBoard.appendChild(cell);
  }

  const cells = document.querySelectorAll(".game-board div");

  if (typeof io !== "undefined") {
    socket = io();

    const urlParams = new URLSearchParams(window.location.search);
    roomID = urlParams.get('roomID');

    if (!roomID) {
      window.location.href = "lobby.html";
    } else {
      socket.emit("joinGame", roomID);
    }

    socket.on("assignPlayer", ({ symbol, isTurn }) => {
      playerSymbol = symbol;
      isMyTurn = isTurn;
      updateTurnIndicator();
    });

    socket.on("startGame", () => {
      gameActive = true;
      resetGame();
      updateTurnIndicator();
    });

    socket.on("opponentMove", ({ index, symbol }) => {
      updateBoard(index, symbol);
      afterMove(symbol);
    });

    socket.on("rematchOffer", () => {
      const modal = document.getElementById("result-modal");
      const message = document.getElementById("result-message");
      const playAgainBtn = document.getElementById("play-again-btn");
      const menuBtn = document.getElementById("menu-btn");

      modal.classList.remove("hidden");
      message.textContent = "Opponent wants a Rematch!";
      playAgainBtn.textContent = "Accept Challenge";
      playAgainBtn.disabled = false;

      playAgainBtn.onclick = () => {
        socket.emit("rematchResponse", { roomID, accepted: true });
        modal.classList.add("hidden");
      };

      menuBtn.onclick = () => {
        socket.emit("rematchResponse", { roomID, accepted: false });
        window.location.href = "lobby.html";
      };
    });

    socket.on("startRematch", () => {
      resetGame();
      document.getElementById("result-modal").classList.add("hidden");
      updateTurnIndicator();

      const playAgainBtn = document.getElementById("play-again-btn");
      const menuBtn = document.getElementById("menu-btn");

      playAgainBtn.textContent = "Challenge Again";
      playAgainBtn.disabled = false;
      playAgainBtn.onclick = () => {
        if (socket) {
          socket.emit("rematchRequest", roomID);
        }
        playAgainBtn.disabled = true;
        playAgainBtn.textContent = "Waiting for Opponent...";

        const message = document.getElementById("result-message");
        message.textContent = "Challenge sent to opponent...";
      };

      menuBtn.onclick = () => {
        window.location.href = "lobby.html";
      };
    });

    socket.on("opponentLeft", () => {
      if (gameActive) {
        gameActive = false;
        showWinner(playerSymbol);
        // alert("Opponent has left the game. You win!");
      }
    });

    socket.on("rematchDeclined", () => {
      alert("Opponent declined rematch.");
      window.location.href = "lobby.html";
    });

    socket.on("opponentGaveUp", () => {
      if (gameActive) {
        stopTurnTimer();
        gameActive = false;
        showWinner(playerSymbol);
        document.getElementById("result-message").innerHTML = "🏆 You Won!, Opponent gave up!";
      }
    });

    socket.on("opponentTimeUp", () => {
      if (gameActive) {
        stopTurnTimer();
        gameActive = false;
        showWinner(playerSymbol);
        document.getElementById("result-message").innerHTML = "🏆 You Won!, Opponent lost on time!";
      }
    });
  }

  cells.forEach((cell, index) => {
    cell.addEventListener("click", () => {
      if (!gameActive || board[index] !== "" || !isMyTurn) return;
      makeMove(index);
    });
  });

  giveUpButton.addEventListener("click", () => {
    if (gameActive) {
      giveUp();
    }
  });
});

function makeMove(index) {
  updateBoard(index, playerSymbol);
  afterMove(playerSymbol);
  if (socket) {
    socket.emit("makeMove", { room: roomID, index, symbol: playerSymbol });
  }
}

function updateBoard(index, symbol) {
  board[index] = symbol;
  const cell = document.querySelectorAll(".game-board div")[index];
  cell.textContent = symbol;
  cell.classList.remove("faded");

  let moves = symbol === "X" ? xMoves : oMoves;
  moves.push(index);
  if (moves.length > 3) {
    const removed = moves.shift();
    removeOldestMove(removed);
  }
}

function afterMove(symbol) {
  const winner = checkWinner();
  if (winner) {
    gameActive = false;
    stopTurnTimer();
    showWinner(winner);
  } else {
    isMyTurn = (symbol !== playerSymbol);
    updateTurnIndicator();
    updateFading();
    startTurnTimer();
  }
}

function updateFading() {
  const cells = document.querySelectorAll(".game-board div");
  cells.forEach((cell) => cell.classList.remove("faded"));

  const turnMoves = isMyTurn ? (playerSymbol === "X" ? xMoves : oMoves)
                              : (playerSymbol === "X" ? oMoves : xMoves);

  if (turnMoves.length === 3) {
    fadeOldestMove(turnMoves[0]);
  }
}

function fadeOldestMove(index) {
  const cell = document.querySelectorAll(".game-board div")[index];
  cell.classList.add("faded");
}

function removeOldestMove(index) {
  board[index] = "";
  const cell = document.querySelectorAll(".game-board div")[index];
  cell.textContent = "";
  cell.classList.remove("faded");
}

function checkWinner() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  for (const [a, b, c] of winPatterns) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.every(cell => cell !== "") ? "Tie" : null;
}

function updateTurnIndicator(winner = null) {
  const indicator = document.getElementById("turn-indicator");
  if (winner === "X" || winner === "O") {
    showWinner(winner);
  } else {
    indicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
  }
}

function startTurnTimer() {
  clearInterval(timerInterval);
  timeLeft = 15;

  const timerContainer = document.getElementById("timer-container");
  if (isMyTurn) {
    timerContainer.textContent = `⏱ ${timeLeft}s`;
    timerInterval = setInterval(() => {
      timeLeft--;
      timerContainer.textContent = `⏱ ${timeLeft}s`;

      if (timeLeft == 0) {
        clearInterval(timerInterval);
        timerContainer.textContent = "⏱ Time's up!";
        if (socket && gameActive) {
          gameActive = false;
          stopTurnTimer();
          const winner = playerSymbol === "X" ? "O" : "X";
          showWinner(winner);
          document.getElementById("result-message").textContent += " ⏱ Time's up!";
          socket.emit("timeOut", { roomID, symbol: playerSymbol });
        }
      }
    }, 1000);
  } else {
    timerContainer.textContent = "⏱";
  }
}

function stopTurnTimer() {
  clearInterval(timerInterval);
  document.getElementById("timer-container").textContent = "⏱";
}

function showWinner(winnerSymbol) {
  const indicator = document.getElementById("turn-indicator");
  const modal = document.getElementById("result-modal");
  const message = document.getElementById("result-message");
  const playAgainBtn = document.getElementById("play-again-btn");
  const menuBtn = document.getElementById("menu-btn");

  if (winnerSymbol === playerSymbol) {
    indicator.innerHTML = `🏆 <strong>You Won!</strong>`;
    message.textContent = "🏆 You Won!";
  } else {
    indicator.innerHTML = `😞 <strong>You Lost!</strong>`;
    message.textContent = "😞 You Lost!";
  }

  modal.classList.remove("hidden");

  playAgainBtn.textContent = "Challenge Again";
  playAgainBtn.disabled = false;
  playAgainBtn.onclick = () => {
    if (socket) {
      socket.emit("rematchRequest", roomID);
    }
    playAgainBtn.disabled = true;
    playAgainBtn.textContent = "Waiting for Opponent...";

    const message = document.getElementById("result-message");
    message.textContent = "Challenge sent to opponent...";
  };

  menuBtn.onclick = () => {
    window.location.href = "lobby.html";
  };
}

function giveUp() {
  stopTurnTimer();
  if (!gameActive) return;
  gameActive = false;
  if (socket) {
    socket.emit("giveUp", roomID);
  }
  const winner = playerSymbol === "X" ? "O" : "X";
  showWinner(winner);
}

function resetGame() {
  stopTurnTimer();
  board = Array(9).fill("");
  gameActive = true;
  xMoves = [];
  oMoves = [];
  document.querySelectorAll(".game-board div").forEach((cell) => {
    cell.textContent = "";
    cell.classList.remove("faded");
  });
  updateFading();
}
