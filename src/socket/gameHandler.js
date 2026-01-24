/**
 * Socket.IO Game Event Handlers
 * Handles all game-related socket events
 */

const {
  ROOM_STATUS,
  TURN_TIMER_SECONDS,
  RECONNECTION_GRACE_PERIOD_MS,
  LOBBY_TIMEOUT_MS,
  LOBBY_CLEANUP_DELAY_MS,
  createRoom,
  addPlayerToRoom,
  getPlayerBySocketId,
  getOpponent,
  findRoomBySocketId,
  processMove,
  getFadingMoveIndex,
  resetRoomForRematch,
  startGame,
  endGame,
  isValidRoomCode,
  isValidMoveIndex,
  isValidSymbol,
  getRemainingTurnTime,
  clearRematchRequests
} = require('../utils/roomUtils');

// ==================== STATE TRACKING ====================

// Track active timeout timers per room
const roomTimers = {};

// Separate lobby tracking (not game rooms)
const lobbies = {};

// Rate limiting: track last event time per socket
const socketRateLimits = {};
const RATE_LIMIT_MS = 100; // Minimum 100ms between events

// ==================== HELPER FUNCTIONS ====================

/**
 * Simple rate limiter
 * @param {string} socketId - Socket ID
 * @param {string} eventName - Event name
 * @returns {boolean} - True if rate limited (should block)
 */
function isRateLimited(socketId, eventName) {
  const key = `${socketId}:${eventName}`;
  const now = Date.now();
  const lastTime = socketRateLimits[key] || 0;
  
  if (now - lastTime < RATE_LIMIT_MS) {
    return true;
  }
  
  socketRateLimits[key] = now;
  return false;
}

/**
 * Clean up rate limit entries for a socket
 * @param {string} socketId - Socket ID
 */
function cleanupRateLimits(socketId) {
  for (const key in socketRateLimits) {
    if (key.startsWith(`${socketId}:`)) {
      delete socketRateLimits[key];
    }
  }
}

/**
 * Log with timestamp
 * @param {string} level - Log level
 * @param {string} message - Message
 */
function log(level, message) {
  const timestamp = new Date().toISOString();
  console[level](`[${timestamp}] ${message}`);
}

/**
 * Start/restart server-side turn timer for a room
 * @param {Object} io - Socket.IO server
 * @param {Object} rooms - Rooms object
 * @param {string} roomId - Room ID
 */
function startServerTurnTimer(io, rooms, roomId) {
  // Clear existing timer for this room
  stopServerTurnTimer(roomId);
  
  const room = rooms[roomId];
  if (!room || !room.gameState.isActive) return;
  
  // Calculate how long until timeout
  const remainingMs = getRemainingTurnTime(room.gameState) * 1000;
  
  roomTimers[roomId] = setTimeout(() => {
    const currentRoom = rooms[roomId];
    if (!currentRoom || !currentRoom.gameState.isActive) {
      delete roomTimers[roomId];
      return;
    }
    
    // Time's up! The current player loses
    const loserSymbol = currentRoom.gameState.currentTurn;
    const winnerSymbol = loserSymbol === 'X' ? 'O' : 'X';
    
    endGame(currentRoom, winnerSymbol, 'timeout');
    
    // Notify both players
    currentRoom.players.forEach(player => {
      if (player.isConnected) {
        if (player.symbol === loserSymbol) {
          io.to(player.socketId).emit('timedOut', { winner: winnerSymbol });
        } else {
          io.to(player.socketId).emit('opponentTimeUp');
        }
      }
    });
    
    delete roomTimers[roomId];
    log('info', `Server timeout: ${loserSymbol} lost in room ${roomId}`);
  }, remainingMs);
}

/**
 * Stop server-side turn timer for a room
 * @param {string} roomId - Room ID
 */
function stopServerTurnTimer(roomId) {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
}

/**
 * Clean up a room completely (including timer)
 * @param {Object} rooms - Rooms object
 * @param {string} roomId - Room ID
 */
function cleanupRoom(rooms, roomId) {
  stopServerTurnTimer(roomId);
  delete rooms[roomId];
  log('info', `Room ${roomId} cleaned up`);
}

/**
 * Sanitize game state for client (remove internal data)
 * @param {Object} gameState - Full game state
 * @returns {Object} - Sanitized game state
 */
function sanitizeGameState(gameState) {
  return {
    board: [...gameState.board],
    xMoves: [...gameState.xMoves],
    oMoves: [...gameState.oMoves],
    currentTurn: gameState.currentTurn,
    isActive: gameState.isActive,
    winner: gameState.winner,
    winningLine: gameState.winningLine || null
  };
}

// ==================== LOBBY CLEANUP ====================

// Periodic cleanup of stale lobbies
setInterval(() => {
  const now = Date.now();
  for (const lobbyId in lobbies) {
    const lobby = lobbies[lobbyId];
    if (now - lobby.createdAt > LOBBY_TIMEOUT_MS) {
      delete lobbies[lobbyId];
      log('info', `Stale lobby cleaned up: ${lobbyId}`);
    }
  }
}, 60000); // Check every minute

// ==================== MAIN HANDLER ====================

/**
 * Initialize game handlers for a socket connection
 * @param {Object} io - Socket.IO server instance
 * @param {Object} socket - Socket connection
 * @param {Object} rooms - Rooms state object
 */
function initGameHandlers(io, socket, rooms) {
  log('info', `New connection: ${socket.id}`);

  // ==================== LOBBY EVENTS ====================
  
  /**
   * Handle creating a lobby room (waiting area, not actual game)
   * Now accepts optional data object with timerDuration
   */
  socket.on('lobbyCreate', (data) => {
    if (isRateLimited(socket.id, 'lobbyCreate')) return;
    
    // Support both old format (just roomId string) and new format (object with roomId and timerDuration)
    let roomId, timerDuration;
    if (typeof data === 'string') {
      // Legacy format: just room ID string
      roomId = data;
      timerDuration = TURN_TIMER_SECONDS; // Default 15 seconds
    } else if (typeof data === 'object' && data !== null) {
      // New format: { roomId, timerDuration }
      roomId = data.roomId;
      timerDuration = data.timerDuration || TURN_TIMER_SECONDS;
    } else {
      socket.emit('error', { message: 'Invalid data format' });
      return;
    }
    
    const sanitizedRoomId = roomId?.trim?.().toUpperCase?.();
    
    if (!isValidRoomCode(sanitizedRoomId)) {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    // Validate timer duration (10, 15, 20, 30, 45, 60 seconds allowed)
    const validDurations = [10, 15, 20, 30, 45, 60];
    const sanitizedTimer = validDurations.includes(timerDuration) ? timerDuration : TURN_TIMER_SECONDS;

    // Check if this socket is already in a lobby
    if (socket.lobbyRoomId) {
      socket.emit('error', { message: 'Already in a lobby' });
      return;
    }

    // Check if lobby already exists
    if (lobbies[sanitizedRoomId]) {
      socket.emit('lobbyFull');
      return;
    }

    // Check if a game room with this ID already exists
    if (rooms[sanitizedRoomId]) {
      socket.emit('lobbyFull');
      return;
    }

    // Create lobby entry with timer duration
    lobbies[sanitizedRoomId] = {
      creator: socket.id,
      joiner: null,
      timerDuration: sanitizedTimer,
      createdAt: Date.now()
    };

    socket.join(`lobby-${sanitizedRoomId}`);
    socket.lobbyRoomId = sanitizedRoomId;
    socket.isLobbyCreator = true;

    socket.emit('lobbyWaiting', { roomId: sanitizedRoomId, timerDuration: sanitizedTimer });
    log('info', `Lobby created: ${sanitizedRoomId} by ${socket.id} with timer ${sanitizedTimer}s`);
  });

  /**
   * Handle joining a lobby room
   */
  socket.on('lobbyJoin', (roomId) => {
    if (isRateLimited(socket.id, 'lobbyJoin')) return;
    
    const sanitizedRoomId = roomId?.trim?.().toUpperCase?.();
    
    if (!isValidRoomCode(sanitizedRoomId)) {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    // Check if this socket is already in a lobby
    if (socket.lobbyRoomId) {
      socket.emit('error', { message: 'Already in a lobby' });
      return;
    }

    const lobby = lobbies[sanitizedRoomId];

    // Check if lobby exists
    if (!lobby) {
      socket.emit('lobbyNotFound');
      return;
    }

    // Check if lobby is already full
    if (lobby.joiner) {
      socket.emit('lobbyFull');
      return;
    }

    // Prevent joining own lobby
    if (lobby.creator === socket.id) {
      socket.emit('error', { message: 'Cannot join your own lobby' });
      return;
    }

    // Join the lobby
    lobby.joiner = socket.id;
    socket.join(`lobby-${sanitizedRoomId}`);
    socket.lobbyRoomId = sanitizedRoomId;
    socket.isLobbyCreator = false;

    // Notify both players that lobby is ready - navigate to game
    // Include timerDuration from lobby settings
    io.to(`lobby-${sanitizedRoomId}`).emit('lobbyReady', { 
      roomId: sanitizedRoomId,
      timerDuration: lobby.timerDuration || TURN_TIMER_SECONDS
    });
    
    // Clean up lobby after a short delay (players are navigating away)
    // But keep timerDuration accessible briefly by not deleting immediately
    const timerDuration = lobby.timerDuration;
    setTimeout(() => {
      delete lobbies[sanitizedRoomId];
    }, LOBBY_CLEANUP_DELAY_MS);

    log('info', `Lobby ready: ${sanitizedRoomId} with timer ${timerDuration}s`);
  });

  // ==================== GAME EVENTS ====================

  /**
   * Handle player joining a game room (from game page)
   * Now accepts optional data object with timerDuration
   */
  socket.on('joinGame', (data) => {
    if (isRateLimited(socket.id, 'joinGame')) return;
    
    // Support both old format (just roomId string) and new format (object with roomId and timerDuration)
    let roomId, timerDuration;
    if (typeof data === 'string') {
      // Legacy format: just room ID string
      roomId = data;
      timerDuration = TURN_TIMER_SECONDS; // Default 15 seconds
    } else if (typeof data === 'object' && data !== null) {
      // New format: { roomId, timerDuration }
      roomId = data.roomId;
      timerDuration = data.timerDuration || TURN_TIMER_SECONDS;
    } else {
      socket.emit('error', { message: 'Invalid data format' });
      return;
    }
    
    // Validate and sanitize room ID
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', { message: 'Invalid room code' });
      return;
    }

    const sanitizedRoomId = roomId.trim().toUpperCase();
    
    if (!isValidRoomCode(sanitizedRoomId)) {
      socket.emit('error', { message: 'Room code must be exactly 6 alphanumeric characters' });
      return;
    }

    // Validate timer duration (10, 15, 20, 30, 45, 60 seconds allowed)
    const validDurations = [10, 15, 20, 30, 45, 60];
    const sanitizedTimer = validDurations.includes(timerDuration) ? timerDuration : TURN_TIMER_SECONDS;

    // Check if this socket is already in a different room
    const existingRoom = findRoomBySocketId(rooms, socket.id);
    if (existingRoom && existingRoom.id !== sanitizedRoomId) {
      socket.emit('error', { message: 'Already in another game' });
      return;
    }

    let room = rooms[sanitizedRoomId];
    let playerInfo;
    let isReconnection = false;

    if (!room) {
      // Create new room - first player with timer duration
      room = createRoom(sanitizedRoomId, socket.id, sanitizedTimer);
      rooms[sanitizedRoomId] = room;
      playerInfo = room.players[0];
      log('info', `Game room created: ${sanitizedRoomId} by ${socket.id} with timer ${sanitizedTimer}s`);
    } else {
      // Room exists - check status
      if (room.players.length >= 2) {
        // Room is full - check if we can replace a disconnected player
        const disconnectedPlayer = room.players.find(p => !p.isConnected);
        
        if (disconnectedPlayer) {
          // Replace the disconnected player
          log('info', `Replacing disconnected player ${disconnectedPlayer.symbol} with ${socket.id}`);
          disconnectedPlayer.socketId = socket.id;
          disconnectedPlayer.isConnected = true;
          playerInfo = disconnectedPlayer;
          isReconnection = true;
          
          // Clear rematch requests on reconnection (socket ID changed)
          clearRematchRequests(room);
        } else {
          socket.emit('roomFull');
          return;
        }
      } else {
        // Room has space - add player
        playerInfo = addPlayerToRoom(room, socket.id);
        if (!playerInfo) {
          socket.emit('roomFull');
          return;
        }
        log('info', `Player joined game: ${socket.id} as ${playerInfo.symbol} to room ${sanitizedRoomId}`);
      }
    }

    // Join the socket room
    socket.join(sanitizedRoomId);
    
    // Store room reference on socket for cleanup
    socket.roomId = sanitizedRoomId;
    socket.playerSymbol = playerInfo.symbol;

    // Determine if it's this player's turn
    const isTurn = room.gameState.currentTurn === playerInfo.symbol;

    // Send player assignment
    socket.emit('assignPlayer', {
      symbol: playerInfo.symbol,
      isTurn: isTurn,
      roomId: sanitizedRoomId
    });

    // Check if both players are now connected
    const connectedPlayers = room.players.filter(p => p.isConnected);
    
    if (connectedPlayers.length === 2 && !room.gameState.isActive) {
      // Start the game (this randomizes X/O assignments)
      startGame(room);
      
      // Update socket.playerSymbol for both players after randomization
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.playerSymbol = player.symbol;
        }
      });
      
      // Start server-side turn timer
      startServerTurnTimer(io, rooms, sanitizedRoomId);
      
      // Calculate fading index for the starting player
      const fadingIndex = getFadingMoveIndex(room.gameState, room.gameState.currentTurn);
      
      // Get timer duration from room settings
      const roomTimerDuration = room.timerDuration || TURN_TIMER_SECONDS;
      
      // Notify both players with their (potentially new) symbols
      room.players.forEach(player => {
        if (player.isConnected) {
          io.to(player.socketId).emit('startGame', {
            gameState: sanitizeGameState(room.gameState),
            yourSymbol: player.symbol,  // This is the randomized symbol
            isTurn: room.gameState.currentTurn === player.symbol,
            remainingTime: roomTimerDuration,
            timerDuration: roomTimerDuration,
            fadingIndex
          });
        }
      });
      
      log('info', `Game started in room: ${sanitizedRoomId} (X: ${room.players.find(p => p.symbol === 'X')?.socketId?.slice(-6)}, O: ${room.players.find(p => p.symbol === 'O')?.socketId?.slice(-6)}) with timer ${roomTimerDuration}s`);
    } else if (room.gameState.isActive) {
      // Game already in progress - send current state (reconnection scenario)
      const remainingTime = getRemainingTurnTime(room.gameState);
      const fadingIndex = getFadingMoveIndex(room.gameState, room.gameState.currentTurn);
      const roomTimerDuration = room.timerDuration || TURN_TIMER_SECONDS;
      
      socket.emit('gameState', {
        gameState: sanitizeGameState(room.gameState),
        yourSymbol: playerInfo.symbol,
        isTurn: room.gameState.currentTurn === playerInfo.symbol,
        remainingTime,
        timerDuration: roomTimerDuration,
        fadingIndex
      });
      
      // Notify opponent that player reconnected
      const opponent = getOpponent(room, socket.id);
      if (opponent && opponent.isConnected) {
        io.to(opponent.socketId).emit('opponentReconnected');
      }
    }
  });

  /**
   * Handle a player making a move
   */
  socket.on('makeMove', ({ room: roomId, index, symbol }) => {
    if (isRateLimited(socket.id, 'makeMove')) return;
    
    // Validate inputs
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('moveError', { message: 'Invalid room' });
      return;
    }
    
    const sanitizedRoomId = roomId.trim().toUpperCase();
    
    // Verify this socket is in this room
    if (socket.roomId !== sanitizedRoomId) {
      socket.emit('moveError', { message: 'Not in this room' });
      return;
    }
    
    const room = rooms[sanitizedRoomId];

    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) {
      socket.emit('error', { message: 'You are not in this room' });
      return;
    }

    // Validate symbol matches player's symbol
    if (player.symbol !== symbol) {
      socket.emit('moveError', { message: 'Invalid symbol' });
      return;
    }

    // Process the move (includes index and symbol validation)
    const result = processMove(room.gameState, index, symbol);

    if (!result.success) {
      socket.emit('moveError', { message: result.error });
      return;
    }

    // Calculate fading info for the next player
    const fadingIndex = getFadingMoveIndex(room.gameState, room.gameState.currentTurn);

    // If game ended, stop timer and notify
    if (result.winner) {
      stopServerTurnTimer(sanitizedRoomId);
      endGame(room, result.winner, 'win');
      
      // Store the winning line in game state for sanitization
      room.gameState.winningLine = result.winningLine;
      
      io.to(sanitizedRoomId).emit('gameOver', {
        winner: result.winner,
        reason: 'win',
        winningLine: result.winningLine,
        gameState: sanitizeGameState(room.gameState),
        fadingIndex
      });
      log('info', `Game over in room ${sanitizedRoomId}: ${result.winner} wins with line ${result.winningLine}`);
    } else {
      // Restart server-side timer for the next player
      startServerTurnTimer(io, rooms, sanitizedRoomId);
      
      // Get timer duration from room settings
      const roomTimerDuration = room.timerDuration || TURN_TIMER_SECONDS;
      
      // Broadcast move to opponent
      const opponent = getOpponent(room, socket.id);
      if (opponent && opponent.isConnected) {
        io.to(opponent.socketId).emit('opponentMove', {
          index,
          symbol,
          removedMove: result.removedMove,
          gameState: sanitizeGameState(room.gameState),
          fadingIndex,
          remainingTime: roomTimerDuration,
          timerDuration: roomTimerDuration
        });
      }

      // Send confirmation to the player who made the move
      socket.emit('moveConfirmed', {
        index,
        symbol,
        removedMove: result.removedMove,
        gameState: sanitizeGameState(room.gameState),
        fadingIndex,
        remainingTime: roomTimerDuration,
        timerDuration: roomTimerDuration
      });
    }
  });

  /**
   * Handle player timeout (client-side notification)
   * Server-side timer is authoritative, so we ignore client timeouts
   */
  socket.on('timeOut', () => {
    // Ignored - server tracks timer authoritatively
  });

  /**
   * Handle player giving up
   */
  socket.on('giveUp', (roomId) => {
    if (isRateLimited(socket.id, 'giveUp')) return;
    
    const sanitizedRoomId = roomId?.trim?.().toUpperCase?.();
    
    // Verify this socket is in this room
    if (socket.roomId !== sanitizedRoomId) {
      return;
    }
    
    const room = rooms[sanitizedRoomId];

    if (!room || !room.gameState.isActive) return;

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) return;

    // Stop the timer
    stopServerTurnTimer(sanitizedRoomId);

    // End the game - opponent wins
    const winnerSymbol = player.symbol === 'X' ? 'O' : 'X';
    endGame(room, winnerSymbol, 'surrender');

    // Notify the player who gave up
    socket.emit('youGaveUp', { winner: winnerSymbol });

    // Notify opponent
    const opponent = getOpponent(room, socket.id);
    if (opponent && opponent.isConnected) {
      io.to(opponent.socketId).emit('opponentGaveUp');
    }

    log('info', `Player ${player.symbol} gave up in room ${sanitizedRoomId}`);
  });

  /**
   * Handle rematch request
   */
  socket.on('rematchRequest', (roomId) => {
    if (isRateLimited(socket.id, 'rematchRequest')) return;
    
    const sanitizedRoomId = roomId?.trim?.().toUpperCase?.();
    
    // Verify this socket is in this room
    if (socket.roomId !== sanitizedRoomId) {
      return;
    }
    
    const room = rooms[sanitizedRoomId];

    if (!room) return;

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) return;

    // Can only request rematch when game is over
    if (room.gameState.isActive) {
      socket.emit('error', { message: 'Game is still active' });
      return;
    }

    // Add to rematch requests
    room.rematchRequests.add(socket.id);
    log('info', `Rematch request from ${player.symbol} in room ${sanitizedRoomId}`);

    const opponent = getOpponent(room, socket.id);

    // If both players want rematch, start new game
    if (room.rematchRequests.size === 2) {
      // Reset room for rematch (this randomizes X/O assignments)
      resetRoomForRematch(room);
      
      // Update socket.playerSymbol for both players after randomization
      room.players.forEach(player => {
        const playerSocket = io.sockets.sockets.get(player.socketId);
        if (playerSocket) {
          playerSocket.playerSymbol = player.symbol;
        }
      });
      
      // Start server-side timer for the new game
      startServerTurnTimer(io, rooms, sanitizedRoomId);
      
      // Calculate fading index (should be null at start)
      const fadingIndex = getFadingMoveIndex(room.gameState, room.gameState.currentTurn);
      
      // Get timer duration from room settings
      const roomTimerDuration = room.timerDuration || TURN_TIMER_SECONDS;
      
      // Notify each player with their (potentially new) symbols
      room.players.forEach(p => {
        if (p.isConnected) {
          io.to(p.socketId).emit('startRematch', {
            gameState: sanitizeGameState(room.gameState),
            yourSymbol: p.symbol,  // This is the randomized symbol
            isTurn: room.gameState.currentTurn === p.symbol,
            remainingTime: roomTimerDuration,
            timerDuration: roomTimerDuration,
            fadingIndex
          });
        }
      });
      
      log('info', `Rematch started in room ${sanitizedRoomId} (X: ${room.players.find(p => p.symbol === 'X')?.socketId?.slice(-6)}, O: ${room.players.find(p => p.symbol === 'O')?.socketId?.slice(-6)}) with timer ${roomTimerDuration}s`);
    } else if (opponent && opponent.isConnected) {
      // Notify opponent of rematch offer
      io.to(opponent.socketId).emit('rematchOffer');
    }
  });

  /**
   * Handle rematch response
   */
  socket.on('rematchResponse', ({ roomID, accepted }) => {
    if (isRateLimited(socket.id, 'rematchResponse')) return;
    
    const sanitizedRoomId = roomID?.trim?.().toUpperCase?.();
    
    // Verify this socket is in this room
    if (socket.roomId !== sanitizedRoomId) {
      return;
    }
    
    const room = rooms[sanitizedRoomId];

    if (!room) return;

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) return;

    const opponent = getOpponent(room, socket.id);

    if (!accepted) {
      // Decline rematch
      if (opponent && opponent.isConnected) {
        io.to(opponent.socketId).emit('rematchDeclined');
      }
      room.rematchRequests.clear();
      log('info', `Rematch declined in room ${sanitizedRoomId}`);
    } else {
      // Accept rematch
      room.rematchRequests.add(socket.id);
      
      if (room.rematchRequests.size === 2) {
        resetRoomForRematch(room);
        
        // Start server-side timer for the new game
        startServerTurnTimer(io, rooms, sanitizedRoomId);
        
        // Calculate fading index (should be null at start)
        const fadingIndex = getFadingMoveIndex(room.gameState, room.gameState.currentTurn);
        
        // Get timer duration from room settings
        const roomTimerDuration = room.timerDuration || TURN_TIMER_SECONDS;
        
        // Notify each player with their specific info
        room.players.forEach(p => {
          if (p.isConnected) {
            io.to(p.socketId).emit('startRematch', {
              gameState: sanitizeGameState(room.gameState),
              yourSymbol: p.symbol,
              isTurn: room.gameState.currentTurn === p.symbol,
              remainingTime: roomTimerDuration,
              timerDuration: roomTimerDuration,
              fadingIndex
            });
          }
        });
        
        log('info', `Rematch started in room ${sanitizedRoomId} with timer ${roomTimerDuration}s`);
      }
    }
  });

  /**
   * Handle player disconnect
   */
  socket.on('disconnect', () => {
    log('info', `Disconnected: ${socket.id}`);
    
    // Clean up rate limits for this socket
    cleanupRateLimits(socket.id);
    
    // Clean up lobby if player was in one
    if (socket.lobbyRoomId) {
      const lobby = lobbies[socket.lobbyRoomId];
      if (lobby) {
        if (lobby.creator === socket.id || lobby.joiner === socket.id) {
          delete lobbies[socket.lobbyRoomId];
          log('info', `Lobby ${socket.lobbyRoomId} cleaned up`);
        }
      }
    }
    
    // Handle game room disconnect
    const room = findRoomBySocketId(rooms, socket.id);
    if (!room) return;

    const player = getPlayerBySocketId(room, socket.id);
    if (!player) return;

    player.isConnected = false;

    const opponent = getOpponent(room, socket.id);

    // If game was active, notify opponent
    if (room.gameState.isActive) {
      if (opponent && opponent.isConnected) {
        io.to(opponent.socketId).emit('opponentDisconnected');
      }
    }

    // Clean up room after delay (allow for reconnection)
    setTimeout(() => {
      const currentRoom = rooms[room.id];
      if (!currentRoom) return;

      // Check if all players are disconnected
      const allDisconnected = currentRoom.players.every(p => !p.isConnected);
      if (allDisconnected) {
        cleanupRoom(rooms, room.id);
      }
    }, RECONNECTION_GRACE_PERIOD_MS);

    log('info', `Player ${player.symbol} disconnected from game room ${room.id}`);
  });
}

module.exports = { initGameHandlers };
