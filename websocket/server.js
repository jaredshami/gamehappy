const fs = require('fs');
const https = require('https');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = https.createServer({
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
}, app);

const io = new Server(server, {
  path: '/websocket'
});

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('message', (msg) => {
    socket.send(msg); // Echo message
  });
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

server.listen(8443, () => {
  console.log('Socket.IO server running at wss://gamehappy.app/websocket');
});
