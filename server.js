const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

app.get('/favicon.ico', (req, res) => res.status(204).send());

const rooms = {};

io.on("connection", (socket) => {
  let roomId = null;

  socket.on("join-room", ({ roomId: rid, playerName }) => {
    roomId = rid;
    if (!rooms[roomId]) rooms[roomId] = {};
    rooms[roomId][socket.id] = {
      name: playerName,
      x: Math.random() * 10,
      y: 0,
      z: Math.random() * 10,
    };
    socket.join(roomId);
    io.to(roomId).emit("state", rooms[roomId]);
  });

  socket.on("move", ({ roomId, position, rotation }) => {
    const player = rooms[roomId]?.[socket.id];
    if (player && position && typeof position.x === 'number' && typeof position.y === 'number' && typeof position.z === 'number') {
      player.x = position.x;
      player.y = position.y;
      player.z = position.z;
      
      // حفظ معلومات الدوران إذا كانت متوفرة
      if (rotation && typeof rotation.y === 'number') {
        player.rotation = player.rotation || {};
        player.rotation.y = rotation.y;
      }
      
      io.to(roomId).emit("state", rooms[roomId]);
    } else if (!position) {
      console.warn(`Malformed move event from socket ${socket.id}: position is undefined or invalid`, position);
    }
  });

  socket.on("disconnect", () => {
    if (roomId && rooms[roomId]) {
      delete rooms[roomId][socket.id];
      io.to(roomId).emit("state", rooms[roomId]);
    }
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`3D Multiplayer Game running at http://localhost:${PORT}`);
});
