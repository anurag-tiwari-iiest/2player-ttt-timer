/**
 * Room and Game State Utilities
 * Centralized room management for the Tic-Tac-Toe server
 */

// ==================== CONSTANTS ====================

// Room states
const ROOM_STATUS = {
  WAITING: 'waiting',
  FULL: 'full',
  IN_GAME: 'in_game',
  GAME_OVER: 'game_over'
};

// Valid player symbols
const VALID_SYMBOLS = ['X', 'O'];

// Timer and timeout constants (in seconds unless noted)
const TURN_TIMER_SECONDS = 15;
const RECONNECTION_GRACE_PERIOD_MS = 30000;  // 30 seconds
const LOBBY_TIMEOUT_MS = 5 * 60 * 1000;      // 5 minutes
const LOBBY_CLEANUP_DELAY_MS = 5000;         // 5 seconds after both join
const STALE_ROOM_THRESHOLD_MS = 60 * 60 * 1000;  // 1 hour
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes

// Board constants
const BOARD_SIZE = 9;
const MAX_MOVES_PER_PLAYER = 3;

// ==================== VALIDATION FUNCTIONS ====================

/**
 * Generate a unique 6-character alphanumeric room code
 * @param {Object} existingRooms - Current rooms object to check for duplicates
 * @returns {string} - 6 character room code
 */
function generateRoomCode(existingRooms = {}) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    attempts++;
  } while (existingRooms[code] && attempts < maxAttempts);

  return code;
}

/**
 * Validate room code format (exactly 6 alphanumeric characters)
 * @param {string} code - Room code to validate
 * @returns {boolean} - Whether the code is valid
 */
function isValidRoomCode(code) {
  if (!code || typeof code !== 'string') return false;
  const sanitized = code.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(sanitized);
}

/**
 * Validate move index (must be integer 0-8)
 * @param {*} index - Index to validate
 * @returns {boolean} - Whether the index is valid
 */
function isValidMoveIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE;
}

/**
 * Validate player symbol
 * @param {*} symbol - Symbol to validate
 * @returns {boolean} - Whether the symbol is valid
 */
function isValidSymbol(symbol) {
  return VALID_SYMBOLS.includes(symbol);
}

// ==================== GAME STATE FUNCTIONS ====================

/**
 * Create a fresh game state
 * @param {number} timerDuration - Timer duration in seconds (default: TURN_TIMER_SECONDS)
 * @returns {Object} - Initial game state
 */
function createInitialGameState(timerDuration = TURN_TIMER_SECONDS) {
  return {
    board: Array(BOARD_SIZE).fill(''),
    xMoves: [],
    oMoves: [],
    currentTurn: 'X',
    moveCount: 0,
    winner: null,
    winningLine: null,
    isActive: false,
    turnStartTime: null,
    turnDuration: timerDuration * 1000
  };
}

/**
 * Create a new room
 * @param {string} roomId - Room identifier
 * @param {string} creatorSocketId - Socket ID of room creator
 * @param {number} timerDuration - Timer duration in seconds (default: TURN_TIMER_SECONDS)
 * @returns {Object} - New room object
 */
function createRoom(roomId, creatorSocketId, timerDuration = TURN_TIMER_SECONDS) {
  return {
    id: roomId,
    players: [{
      socketId: creatorSocketId,
      symbol: 'X',
      isConnected: true
    }],
    status: ROOM_STATUS.WAITING,
    timerDuration: timerDuration,
    gameState: createInitialGameState(timerDuration),
    rematchRequests: new Set(),
    createdAt: Date.now()
  };
}

/**
 * Add a player to an existing room
 * @param {Object} room - Room object
 * @param {string} socketId - Socket ID of joining player
 * @returns {Object|null} - Player info or null if room is full
 */
function addPlayerToRoom(room, socketId) {
  if (room.players.length >= 2) {
    return null;
  }

  // Check if player is already in room (reconnection scenario)
  const existingPlayer = room.players.find(p => p.socketId === socketId);
  if (existingPlayer) {
    existingPlayer.isConnected = true;
    return existingPlayer;
  }

  const newPlayer = {
    socketId: socketId,
    symbol: 'O',
    isConnected: true
  };

  room.players.push(newPlayer);
  room.status = ROOM_STATUS.FULL;
  
  return newPlayer;
}

/**
 * Get player by socket ID from room
 * @param {Object} room - Room object
 * @param {string} socketId - Socket ID to find
 * @returns {Object|null} - Player object or null
 */
function getPlayerBySocketId(room, socketId) {
  return room.players.find(p => p.socketId === socketId) || null;
}

/**
 * Get opponent in room
 * @param {Object} room - Room object
 * @param {string} socketId - Current player's socket ID
 * @returns {Object|null} - Opponent player object or null
 */
function getOpponent(room, socketId) {
  return room.players.find(p => p.socketId !== socketId) || null;
}

/**
 * Check if a socket is already in any room
 * @param {Object} rooms - All rooms object
 * @param {string} socketId - Socket ID to check
 * @returns {Object|null} - Room the socket is in, or null
 */
function findRoomBySocketId(rooms, socketId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.players.some(p => p.socketId === socketId)) {
      return room;
    }
  }
  return null;
}

// ==================== MOVE PROCESSING ====================

/**
 * Process a move on the game state
 * @param {Object} gameState - Current game state
 * @param {number} index - Cell index (0-8)
 * @param {string} symbol - 'X' or 'O'
 * @returns {Object} - Result with success status and any removed move
 */
function processMove(gameState, index, symbol) {
  // Validate index
  if (!isValidMoveIndex(index)) {
    return { success: false, error: 'Invalid move index' };
  }

  // Validate symbol
  if (!isValidSymbol(symbol)) {
    return { success: false, error: 'Invalid symbol' };
  }

  // Validate cell is empty
  if (gameState.board[index] !== '') {
    return { success: false, error: 'Cell already occupied' };
  }

  // Validate it's this player's turn
  if (gameState.currentTurn !== symbol) {
    return { success: false, error: 'Not your turn' };
  }

  // Validate game is active
  if (!gameState.isActive) {
    return { success: false, error: 'Game is not active' };
  }

  // Apply move
  gameState.board[index] = symbol;
  gameState.moveCount++;

  const moves = symbol === 'X' ? gameState.xMoves : gameState.oMoves;
  moves.push(index);

  let removedMove = null;

  // Handle disappearing move (more than 3 moves)
  if (moves.length > MAX_MOVES_PER_PLAYER) {
    removedMove = moves.shift();
    gameState.board[removedMove] = '';
  }

  // Check for winner
  const winResult = checkWinner(gameState);
  if (winResult) {
    gameState.winner = winResult.winner;
    gameState.winningLine = winResult.winningLine;
    gameState.isActive = false;
    gameState.turnStartTime = null;
  } else {
    // Switch turns and reset turn timer
    gameState.currentTurn = symbol === 'X' ? 'O' : 'X';
    gameState.turnStartTime = Date.now();
  }

  return { 
    success: true, 
    removedMove, 
    winner: winResult ? winResult.winner : null,
    winningLine: winResult ? winResult.winningLine : null,
    nextTurn: gameState.currentTurn
  };
}

/**
 * Check for a winner
 * @param {Object} gameState - Current game state
 * @returns {Object|null} - Object with winner symbol and winning line, or null
 */
function checkWinner(gameState) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];

  // Check X wins (using last 3 moves)
  const xMoves = gameState.xMoves.slice(-MAX_MOVES_PER_PLAYER);
  for (const pattern of winPatterns) {
    if (pattern.every(i => xMoves.includes(i))) {
      return { winner: 'X', winningLine: pattern };
    }
  }

  // Check O wins (using last 3 moves)
  const oMoves = gameState.oMoves.slice(-MAX_MOVES_PER_PLAYER);
  for (const pattern of winPatterns) {
    if (pattern.every(i => oMoves.includes(i))) {
      return { winner: 'O', winningLine: pattern };
    }
  }

  return null;
}

/**
 * Get the index of the move that should be faded (about to disappear)
 * @param {Object} gameState - Current game state
 * @param {string} forSymbol - Symbol whose turn it currently is
 * @returns {number|null} - Index to fade or null
 */
function getFadingMoveIndex(gameState, forSymbol) {
  if (!isValidSymbol(forSymbol)) return null;
  
  const moves = forSymbol === 'X' ? gameState.xMoves : gameState.oMoves;
  if (moves.length === MAX_MOVES_PER_PLAYER) {
    return moves[0];
  }
  return null;
}

// ==================== GAME LIFECYCLE ====================

/**
 * Randomly assign X and O symbols to the two players
 * @param {Object} room - Room object with players array
 */
function randomizePlayerSymbols(room) {
  if (room.players.length !== 2) return;
  
  // Randomly decide which player gets X
  const firstPlayerGetsX = Math.random() < 0.5;
  
  room.players[0].symbol = firstPlayerGetsX ? 'X' : 'O';
  room.players[1].symbol = firstPlayerGetsX ? 'O' : 'X';
}

/**
 * Start a game in the room
 * @param {Object} room - Room object
 */
function startGame(room) {
  // Randomly assign X and O to players
  randomizePlayerSymbols(room);
  
  room.gameState = createInitialGameState();
  room.gameState.isActive = true;
  room.gameState.turnStartTime = Date.now();
  room.status = ROOM_STATUS.IN_GAME;
  // currentTurn is already 'X' from createInitialGameState()
}

/**
 * Reset room for a rematch
 * @param {Object} room - Room object
 * @returns {Object} - The reset room
 */
function resetRoomForRematch(room) {
  // Randomly reassign X and O for rematch
  randomizePlayerSymbols(room);
  
  // Use room's saved timer duration for rematch
  const timerDuration = room.timerDuration || TURN_TIMER_SECONDS;
  room.gameState = createInitialGameState(timerDuration);
  room.gameState.isActive = true;
  room.gameState.turnStartTime = Date.now();
  room.status = ROOM_STATUS.IN_GAME;
  room.rematchRequests.clear();
  // currentTurn is already 'X' from createInitialGameState()
  return room;
}

/**
 * Get remaining time for current turn in seconds
 * @param {Object} gameState - Game state object
 * @returns {number} - Remaining seconds (0 if expired)
 */
function getRemainingTurnTime(gameState) {
  if (!gameState.turnStartTime || !gameState.isActive) {
    return TURN_TIMER_SECONDS;
  }
  
  const elapsed = Date.now() - gameState.turnStartTime;
  const remaining = Math.max(0, gameState.turnDuration - elapsed);
  return Math.ceil(remaining / 1000);
}

/**
 * End the current game
 * @param {Object} room - Room object
 * @param {string} winner - Winner symbol
 * @param {string} reason - Reason for game end
 */
function endGame(room, winner, reason) {
  room.gameState.isActive = false;
  room.gameState.winner = winner;
  room.gameState.turnStartTime = null;
  room.status = ROOM_STATUS.GAME_OVER;
  room.gameState.endReason = reason;
}

/**
 * Clear rematch requests for a room (used on reconnection)
 * @param {Object} room - Room object
 */
function clearRematchRequests(room) {
  room.rematchRequests.clear();
}

// ==================== EXPORTS ====================

module.exports = {
  // Constants
  ROOM_STATUS,
  VALID_SYMBOLS,
  TURN_TIMER_SECONDS,
  RECONNECTION_GRACE_PERIOD_MS,
  LOBBY_TIMEOUT_MS,
  LOBBY_CLEANUP_DELAY_MS,
  STALE_ROOM_THRESHOLD_MS,
  ROOM_CLEANUP_INTERVAL_MS,
  BOARD_SIZE,
  MAX_MOVES_PER_PLAYER,
  
  // Validation
  generateRoomCode,
  isValidRoomCode,
  isValidMoveIndex,
  isValidSymbol,
  
  // Room management
  createInitialGameState,
  createRoom,
  addPlayerToRoom,
  getPlayerBySocketId,
  getOpponent,
  findRoomBySocketId,
  
  // Game logic
  processMove,
  checkWinner,
  getFadingMoveIndex,
  
  // Game lifecycle
  randomizePlayerSymbols,
  startGame,
  resetRoomForRematch,
  getRemainingTurnTime,
  endGame,
  clearRematchRequests
};
