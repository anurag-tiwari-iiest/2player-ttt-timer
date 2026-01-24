/**
 * Online Game Controller
 * Handles the online multiplayer game logic with Socket.IO
 */

class OnlineGame {
  constructor() {
    // Game state
    this.board = Array(9).fill('');
    this.xMoves = [];
    this.oMoves = [];
    this.gameActive = false;
    this.playerSymbol = null;
    this.isMyTurn = false;
    this.roomId = null;
    
    // Timer
    this.timerInterval = null;
    this.timeLeft = 15;
    this.timerDuration = 15; // Dynamic timer duration from host
    
    // Socket
    this.socket = null;
    
    // DOM elements (will be initialized later)
    this.elements = {};
  }

  /**
   * Initialize the game
   */
  init() {
    this.cacheElements();
    this.createBoard();
    this.bindEvents();
    this.connectSocket();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      gameBoard: document.getElementById('game-board'),
      turnIndicator: document.getElementById('turn-indicator'),
      timerContainer: document.getElementById('timer-container'),
      giveUpBtn: document.getElementById('giveup-btn'),
      resultModal: document.getElementById('result-modal'),
      resultMessage: document.getElementById('result-message'),
      resultSubtitle: document.getElementById('result-subtitle'),
      playAgainBtn: document.getElementById('play-again-btn'),
      menuBtn: document.getElementById('menu-btn')
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
    this.cells = this.elements.gameBoard.querySelectorAll('div');
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Cell clicks
    this.cells.forEach((cell, index) => {
      cell.addEventListener('click', () => this.handleCellClick(index));
    });

    // Give up button
    this.elements.giveUpBtn.addEventListener('click', () => this.giveUp());
  }

  /**
   * Connect to Socket.IO server
   */
  connectSocket() {
    if (typeof io === 'undefined') {
      console.error('Socket.IO not loaded');
      return;
    }

    this.socket = io();

    // Get room ID and timer from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.roomId = urlParams.get('roomID')?.toUpperCase();
    const timerParam = urlParams.get('timer');
    if (timerParam) {
      this.timerDuration = parseInt(timerParam, 10) || 15;
    }

    if (!this.roomId) {
      window.location.href = '/lobby';
      return;
    }

    // Join the game with timer duration
    this.socket.emit('joinGame', {
      roomId: this.roomId,
      timerDuration: this.timerDuration
    });

    // Setup socket event handlers
    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupSocketHandlers() {
    // Player assignment
    this.socket.on('assignPlayer', ({ symbol, isTurn, roomId }) => {
      this.playerSymbol = symbol;
      this.isMyTurn = isTurn;
      if (roomId) this.roomId = roomId;
      this.updateTurnIndicator();
      console.log(`Assigned as ${symbol}, turn: ${isTurn}`);
    });

    // Game start
    this.socket.on('startGame', ({ gameState, yourSymbol, isTurn, remainingTime, timerDuration, fadingIndex }) => {
      console.log('Game starting!', { yourSymbol, isTurn, remainingTime, timerDuration });
      if (yourSymbol) this.playerSymbol = yourSymbol;
      if (typeof isTurn === 'boolean') this.isMyTurn = isTurn;
      if (timerDuration) this.timerDuration = timerDuration;
      this.syncGameState(gameState);
      this.gameActive = true;
      this.updateTurnIndicator();
      this.applyFading(fadingIndex);
      // Use server-provided remaining time
      this.startTurnTimer(remainingTime || this.timerDuration);
    });

    // Game state update (for reconnection)
    this.socket.on('gameState', ({ gameState, yourSymbol, isTurn, remainingTime, timerDuration, fadingIndex }) => {
      console.log('Received game state (reconnection)', { yourSymbol, isTurn, remainingTime, timerDuration, fadingIndex });
      if (yourSymbol) this.playerSymbol = yourSymbol;
      if (typeof isTurn === 'boolean') this.isMyTurn = isTurn;
      if (timerDuration) this.timerDuration = timerDuration;
      this.syncGameState(gameState);
      this.updateTurnIndicator();
      this.applyFading(fadingIndex);
      // Use server-provided remaining time
      if (this.gameActive) {
        this.startTurnTimer(remainingTime || this.timerDuration);
      }
    });

    // Opponent's move
    this.socket.on('opponentMove', ({ index, symbol, removedMove, gameState, fadingIndex, remainingTime, timerDuration }) => {
      if (timerDuration) this.timerDuration = timerDuration;
      this.syncGameState(gameState);
      this.renderBoard();
      this.isMyTurn = true;
      this.updateTurnIndicator();
      this.applyFading(fadingIndex);
      
      if (this.gameActive) {
        // Use server-provided remaining time
        this.startTurnTimer(remainingTime || this.timerDuration);
      }
    });

    // Move confirmed
    this.socket.on('moveConfirmed', ({ gameState, fadingIndex, remainingTime, timerDuration }) => {
      if (timerDuration) this.timerDuration = timerDuration;
      this.syncGameState(gameState);
      this.isMyTurn = false;
      this.updateTurnIndicator();
      // Apply fading to show opponent's oldest move (since it's now their turn)
      this.applyFading(fadingIndex);
      // Show opponent's timer countdown (not interactive for us)
      this.showOpponentTimer(remainingTime || this.timerDuration);
    });

    // Game over
    this.socket.on('gameOver', ({ winner, reason, gameState }) => {
      this.syncGameState(gameState);
      this.gameActive = false;
      this.stopTurnTimer();
      
      let reasonText = '';
      if (reason === 'win') {
        reasonText = winner === this.playerSymbol ? 'You got 3 in a row!' : 'Opponent got 3 in a row';
      }
      this.showWinner(winner, reasonText);
    });

    // Rematch offer
    this.socket.on('rematchOffer', () => {
      this.showRematchOffer();
    });

    // Rematch start
    this.socket.on('startRematch', ({ gameState, yourSymbol, isTurn, remainingTime, timerDuration, fadingIndex }) => {
      console.log('Rematch starting!', { yourSymbol, isTurn, remainingTime, timerDuration });
      this.resetGame();
      if (yourSymbol) this.playerSymbol = yourSymbol;
      if (typeof isTurn === 'boolean') this.isMyTurn = isTurn;
      if (timerDuration) this.timerDuration = timerDuration;
      this.syncGameState(gameState);
      this.gameActive = true;
      this.hideModal();
      this.updateTurnIndicator();
      this.applyFading(fadingIndex);
      
      // Reset button states
      this.elements.playAgainBtn.textContent = '⚔️ Challenge Again';
      this.elements.playAgainBtn.disabled = false;
      this.elements.playAgainBtn.classList.remove('waiting-pulse');
      this.elements.resultSubtitle.textContent = '';
      
      // Use server-provided remaining time
      this.startTurnTimer(remainingTime || this.timerDuration);
    });

    // Opponent disconnected (but might reconnect)
    this.socket.on('opponentDisconnected', () => {
      console.log('Opponent disconnected');
      this.elements.turnIndicator.innerHTML = `⏳ <strong>Opponent disconnected...</strong>`;
    });

    // Opponent reconnected
    this.socket.on('opponentReconnected', () => {
      console.log('Opponent reconnected');
      this.updateTurnIndicator();
    });

    // Server-side timeout (you lost on time)
    this.socket.on('timedOut', ({ winner }) => {
      console.log('Server timeout - you lost');
      this.gameActive = false;
      this.stopTurnTimer();
      this.showWinner(winner, 'You ran out of time');
    });

    // Rematch declined
    this.socket.on('rematchDeclined', () => {
      alert('Opponent declined rematch.');
      window.location.href = '/lobby';
    });

    // Opponent left
    this.socket.on('opponentLeft', () => {
      if (this.gameActive) {
        this.gameActive = false;
        this.stopTurnTimer();
        this.showWinner(this.playerSymbol, 'Opponent left the game');
      }
    });

    // Opponent gave up
    this.socket.on('opponentGaveUp', () => {
      if (this.gameActive) {
        this.gameActive = false;
        this.stopTurnTimer();
        this.showWinner(this.playerSymbol, 'Opponent surrendered');
      }
    });

    // Opponent timeout
    this.socket.on('opponentTimeUp', () => {
      if (this.gameActive) {
        this.gameActive = false;
        this.stopTurnTimer();
        this.showWinner(this.playerSymbol, 'Opponent ran out of time');
      }
    });

    // Room full
    this.socket.on('roomFull', () => {
      alert('Room is full. Please try another room.');
      window.location.href = '/lobby';
    });

    // Error handling
    this.socket.on('error', ({ message }) => {
      console.error('Server error:', message);
    });

    this.socket.on('moveError', ({ message }) => {
      console.error('Move error:', message);
    });
  }

  /**
   * Sync local state with server state
   */
  syncGameState(gameState) {
    if (!gameState) return;
    
    this.board = [...gameState.board];
    this.xMoves = [...gameState.xMoves];
    this.oMoves = [...gameState.oMoves];
    this.gameActive = gameState.isActive;
    
    // Determine if it's my turn
    this.isMyTurn = gameState.currentTurn === this.playerSymbol;
    
    this.renderBoard();
  }

  /**
   * Render the board from current state
   */
  renderBoard() {
    this.cells.forEach((cell, index) => {
      const symbol = this.board[index];
      cell.textContent = symbol;
      cell.classList.remove('cell-o', 'faded');
      if (symbol === 'O') {
        cell.classList.add('cell-o');
      }
    });
  }

  /**
   * Handle cell click
   */
  handleCellClick(index) {
    if (!this.gameActive || !this.isMyTurn || this.board[index] !== '') {
      return;
    }

    // Optimistic update
    this.board[index] = this.playerSymbol;
    const cell = this.cells[index];
    cell.textContent = this.playerSymbol;
    if (this.playerSymbol === 'O') {
      cell.classList.add('cell-o');
    }

    // Send move to server
    this.socket.emit('makeMove', {
      room: this.roomId,
      index,
      symbol: this.playerSymbol
    });

    this.isMyTurn = false;
    this.stopTurnTimer();
    this.updateTurnIndicator();
  }

  /**
   * Apply fading to a cell
   */
  applyFading(fadingIndex) {
    // Clear all fading
    this.cells.forEach(cell => cell.classList.remove('faded'));
    
    // Apply fading to specific cell
    if (fadingIndex !== null && fadingIndex !== undefined && fadingIndex >= 0) {
      this.cells[fadingIndex].classList.add('faded');
    }
  }

  /**
   * Update turn indicator display
   */
  updateTurnIndicator() {
    if (this.isMyTurn) {
      this.elements.turnIndicator.innerHTML = 
        `⚔️ <strong>Your Turn</strong> (${this.playerSymbol})`;
    } else {
      this.elements.turnIndicator.innerHTML = 
        `⏳ <strong>Opponent's Turn</strong>`;
    }
    this.elements.turnIndicator.classList.remove('end-message');
  }

  /**
   * Start turn timer with server-provided remaining time
   * @param {number} remainingSeconds - Seconds remaining from server
   */
  startTurnTimer(remainingSeconds = 15) {
    this.stopTurnTimer();
    this.timeLeft = Math.max(1, Math.floor(remainingSeconds));

    if (!this.isMyTurn) {
      // Show opponent's countdown (they're playing)
      this.showOpponentTimer(this.timeLeft);
      return;
    }

    this.elements.timerContainer.textContent = `⏱ ${this.timeLeft}s`;
    this.elements.timerContainer.classList.remove('opponent-timer');

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.elements.timerContainer.textContent = `⏱ ${this.timeLeft}s`;

      if (this.timeLeft <= 0) {
        this.stopTurnTimer();
        this.elements.timerContainer.textContent = "⏱ Time's up!";
        // Server will handle the actual timeout - we just show the UI
        // Don't emit timeOut - server tracks this now
      }
    }, 1000);
  }

  /**
   * Show opponent's timer (when it's their turn)
   * @param {number} remainingSeconds - Seconds remaining
   */
  showOpponentTimer(remainingSeconds = 15) {
    this.stopTurnTimer();
    this.timeLeft = Math.max(1, Math.floor(remainingSeconds));
    
    this.elements.timerContainer.textContent = `⏱ ${this.timeLeft}s`;
    this.elements.timerContainer.classList.add('opponent-timer');

    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft >= 0) {
        this.elements.timerContainer.textContent = `⏱ ${this.timeLeft}s`;
      }
      
      if (this.timeLeft <= 0) {
        this.stopTurnTimer();
        // Server will notify us if opponent times out
      }
    }, 1000);
  }

  /**
   * Stop turn timer
   */
  stopTurnTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.elements.timerContainer.textContent = '⏱';
    this.elements.timerContainer.classList.remove('opponent-timer');
  }

  /**
   * Show winner modal
   * @param {string} winnerSymbol - The winning symbol
   * @param {string} reason - Optional reason for the win
   */
  showWinner(winnerSymbol, reason = '') {
    const isWinner = winnerSymbol === this.playerSymbol;
    
    if (isWinner) {
      this.elements.turnIndicator.innerHTML = `🏆 <strong>Victory!</strong>`;
      this.elements.turnIndicator.classList.add('end-message');
      this.elements.resultMessage.textContent = '🏆 Victory!';
      this.elements.resultSubtitle.textContent = reason || 'You won the game!';
    } else {
      this.elements.turnIndicator.innerHTML = `💀 <strong>Defeated!</strong>`;
      this.elements.turnIndicator.classList.remove('end-message');
      this.elements.resultMessage.textContent = '💀 Defeated!';
      this.elements.resultSubtitle.textContent = reason || 'Better luck next time!';
    }

    this.showModal();
    this.setupResultButtons();
  }

  /**
   * Show the modal
   */
  showModal() {
    this.elements.resultModal.style.display = 'block';
    this.elements.resultModal.classList.remove('hidden');
  }

  /**
   * Setup result modal buttons
   */
  setupResultButtons() {
    this.elements.playAgainBtn.textContent = '⚔️ Challenge Again';
    this.elements.playAgainBtn.disabled = false;
    this.elements.playAgainBtn.classList.remove('waiting-pulse');
    
    this.elements.playAgainBtn.onclick = () => {
      this.socket.emit('rematchRequest', this.roomId);
      this.elements.playAgainBtn.disabled = true;
      this.elements.playAgainBtn.textContent = '⏳ Waiting for Opponent...';
      this.elements.playAgainBtn.classList.add('waiting-pulse');
      this.elements.resultSubtitle.textContent = 'Challenge sent! Waiting for opponent to accept...';
    };

    this.elements.menuBtn.onclick = () => {
      window.location.href = '/lobby';
    };
  }

  /**
   * Show rematch offer
   */
  showRematchOffer() {
    this.showModal();
    this.elements.resultMessage.textContent = '⚔️ Rematch Challenge!';
    this.elements.resultSubtitle.textContent = 'Your opponent wants another round!';
    this.elements.playAgainBtn.textContent = '✅ Accept Challenge';
    this.elements.playAgainBtn.disabled = false;
    this.elements.playAgainBtn.classList.remove('waiting-pulse');

    this.elements.playAgainBtn.onclick = () => {
      this.socket.emit('rematchResponse', { roomID: this.roomId, accepted: true });
      this.elements.playAgainBtn.disabled = true;
      this.elements.playAgainBtn.textContent = '⏳ Starting...';
      this.elements.resultSubtitle.textContent = 'Get ready for the rematch!';
    };

    this.elements.menuBtn.onclick = () => {
      this.socket.emit('rematchResponse', { roomID: this.roomId, accepted: false });
      window.location.href = '/lobby';
    };
  }

  /**
   * Hide result modal
   */
  hideModal() {
    this.elements.resultModal.style.display = 'none';
    this.elements.resultModal.classList.add('hidden');
  }

  /**
   * Give up the game
   */
  giveUp() {
    if (!this.gameActive) return;
    
    this.stopTurnTimer();
    this.gameActive = false;
    this.socket.emit('giveUp', this.roomId);
    
    const winner = this.playerSymbol === 'X' ? 'O' : 'X';
    this.showWinner(winner, 'You surrendered');
  }

  /**
   * Reset game state for rematch
   */
  resetGame() {
    this.stopTurnTimer();
    this.board = Array(9).fill('');
    this.xMoves = [];
    this.oMoves = [];
    this.gameActive = true;
    
    // Re-determine turn based on symbol (X always starts)
    this.isMyTurn = this.playerSymbol === 'X';
    
    this.cells.forEach(cell => {
      cell.textContent = '';
      cell.classList.remove('faded', 'cell-o');
    });
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const game = new OnlineGame();
  game.init();
});
