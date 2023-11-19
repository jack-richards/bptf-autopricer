const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const config = require('../config.json');

// Event handler when a new client connects
io.on('connection', (socket) => {
  console.log(`A new client connected. Socket ID: ${socket.id}`);

  // Event handler when the client disconnects
  socket.on('disconnect', () => {
    console.log(`Client disconnected. Socket ID: ${socket.id}`);
  });
});

const PORT = config.pricerSocketPort || 9850;

server.listen(PORT, () => {
  console.log(`Socket.IO server is running on port ${PORT}`);
});

const socketIO = io;
module.exports.socketIO = socketIO;