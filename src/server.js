/**
 * Disappearing Tic-Tac-Toe Server
 * Main server entry point with Express and Socket.IO
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const { initGameHandlers } = require('./socket/gameHandler');
const { 
  STALE_ROOM_THRESHOLD_MS, 
  ROOM_CLEANUP_INTERVAL_MS 
} = require('./utils/roomUtils');

// ==================== CONFIGURATION ====================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

// ==================== EXPRESS SETUP ====================

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS for cross-platform support
const io = socketIo(server, {
  cors: {
    origin: IS_PRODUCTION ? process.env.ALLOWED_ORIGINS?.split(',') || '*' : '*',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Centralized rooms state
const rooms = {};

// Enable CORS for all Express routes
app.use(cors({
  origin: IS_PRODUCTION ? process.env.ALLOWED_ORIGINS?.split(',') || '*' : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

// ==================== API ROUTES ====================

// Health check endpoint for mobile apps and load balancers
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    activeRooms: Object.keys(rooms).length,
    uptime: process.uptime()
  });
});

// API endpoint to get room info (protected in production)
app.get('/api/rooms', (req, res) => {
  // In production, require API key or disable entirely
  if (IS_PRODUCTION) {
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  
  const roomSummary = Object.entries(rooms).map(([id, room]) => ({
    id,
    players: room.players.length,
    connectedPlayers: room.players.filter(p => p.isConnected).length,
    status: room.status,
    isActive: room.gameState.isActive,
    createdAt: room.createdAt
  }));
  res.json({ rooms: roomSummary, count: roomSummary.length });
});

// ==================== STATIC FILES ====================

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Route for index (home page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Routes for game pages (support both /pagename and /pages/pagename.html)
const pages = ['lobby', 'twoplayer', 'twoplayer_offline', 'singleplayer'];

pages.forEach(page => {
  // Clean URL: /lobby
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `../public/pages/${page}.html`));
  });
  
  // Legacy URL: /pagename.html
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(`/${page}`);
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/index.html'));
});

// ==================== SOCKET.IO ====================

// Connection handling
io.on('connection', (socket) => {
  initGameHandlers(io, socket, rooms);
});

// ==================== CLEANUP TASKS ====================

// Periodic cleanup of stale rooms
setInterval(() => {
  const now = Date.now();

  for (const roomId in rooms) {
    const room = rooms[roomId];
    
    // Clean up rooms that are old and inactive
    if (now - room.createdAt > STALE_ROOM_THRESHOLD_MS && !room.gameState.isActive) {
      // Check if all players are disconnected
      const allDisconnected = room.players.every(p => !p.isConnected);
      if (allDisconnected || room.players.length === 0) {
        delete rooms[roomId];
        console.log(`[${new Date().toISOString()}] Stale room cleaned up: ${roomId}`);
      }
    }
  }
}, ROOM_CLEANUP_INTERVAL_MS);

// ==================== ERROR HANDLING ====================

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
  // In production, you might want to restart the process
  if (IS_PRODUCTION) {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

// ==================== SERVER START ====================

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     Disappearing Tic-Tac-Toe Server                    ║
║     Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}                         ║
║     Port: ${PORT}                                          ║
║     URL: http://localhost:${PORT}                          ║
╚════════════════════════════════════════════════════════╝
  `);
});

// ==================== GRACEFUL SHUTDOWN ====================

function gracefulShutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
    
    // Close all socket connections
    io.close(() => {
      console.log('Socket.IO server closed');
      process.exit(0);
    });
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
