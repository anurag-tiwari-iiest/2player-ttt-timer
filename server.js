const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const rooms = {};

app.use(express.static(path.join(__dirname, "public")));

app.use(express.static('public'));

io.on("connection", (socket) => {
  console.log("New user connected");

  socket.on("joinGame", (roomID) => {
    socket.join(roomID);
    const room = rooms[roomID] || {
      players: [],
      currentTurn: "X",
      rematchRequests: [],
    };

    if (room.players.length >= 2) {
      socket.emit("roomFull");
      return;
    }

    room.players.push(socket.id);
    rooms[roomID] = room;

    const playerSymbol = room.players.length === 1 ? "X" : "O";
    const isTurn = playerSymbol === "X";

    socket.emit("assignPlayer", { symbol: playerSymbol, isTurn });

    if (room.players.length === 2) {
      io.to(roomID).emit("startGame");
    }

    socket.on("makeMove", ({ room, index, symbol }) => {
      socket.to(room).emit("opponentMove", { index, symbol });
    });

    socket.on("timeOut", ({ roomID, symbol }) => {
        const room = rooms[roomID];
        if (room) {
          const otherPlayer = room.players.find((id) => id !== socket.id);
          if (otherPlayer) {
            io.to(otherPlayer).emit("opponentTimeUp");
          }
        }
    });

    socket.on("giveUp", (roomID) => {
      const room = rooms[roomID];
      if (room) {
        const otherPlayer = room.players.find((id) => id !== socket.id);
        if (otherPlayer) {
          io.to(otherPlayer).emit("opponentGaveUp");
        }
      }
    });

    socket.on("rematchRequest", (roomID) => {
      const room = rooms[roomID];
      if (!room) return;

      room.rematchRequests = room.rematchRequests || [];
      if (!room.rematchRequests.includes(socket.id)) {
        room.rematchRequests.push(socket.id);
      }

      const otherPlayer = room.players.find((id) => id !== socket.id);
      if (otherPlayer) {
        io.to(otherPlayer).emit("rematchOffer");
      }

      if (room.rematchRequests.length === 2) {
        io.to(roomID).emit("startRematch");
        room.rematchRequests = [];
      }
    });

    socket.on("rematchResponse", ({ roomID, accepted }) => {
      const room = rooms[roomID];
      if (!room) return;

      if (!accepted) {
        const otherPlayer = room.players.find((id) => id !== socket.id);
        if (otherPlayer) {
          io.to(otherPlayer).emit("rematchDeclined");
        }
      } else {
        room.rematchRequests.push(socket.id);
        if (room.rematchRequests.length === 2) {
          io.to(roomID).emit("startRematch");
          room.rematchRequests = [];
        }
      }
    });

    socket.on("disconnect", () => {
      for (const [roomID, room] of Object.entries(rooms)) {
        if (room.players.includes(socket.id)) {
          const otherPlayer = room.players.find((id) => id !== socket.id);
          if (otherPlayer) {
            io.to(otherPlayer).emit("opponentLeft");
          }
          delete rooms[roomID];
          break;
        }
      }
    });
      
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});