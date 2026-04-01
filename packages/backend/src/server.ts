import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';

const httpServer = createServer(app);

// ---------------------------------------------------------------------------
// Socket.io
// ---------------------------------------------------------------------------
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.frontendUrl,
    credentials: true,
  },
});

// Ambient listening – real-time audio stream
const ambientStream = io.of('/ambient/stream');
ambientStream.on('connection', (socket) => {
  console.log(`[ambient/stream] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[ambient/stream] client disconnected: ${socket.id}`);
  });
});

// Ambient listening – extracted clinical entities
const ambientEntities = io.of('/ambient/entities');
ambientEntities.on('connection', (socket) => {
  console.log(`[ambient/entities] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[ambient/entities] client disconnected: ${socket.id}`);
  });
});

// Knowledge-base engine – live queries
const kbeLive = io.of('/kbe/live');
kbeLive.on('connection', (socket) => {
  console.log(`[kbe/live] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[kbe/live] client disconnected: ${socket.id}`);
  });
});

// Safety-net – real-time alerts
const safetyNetAlerts = io.of('/safety-net/alerts');
safetyNetAlerts.on('connection', (socket) => {
  console.log(`[safety-net/alerts] client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[safety-net/alerts] client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(config.port, () => {
  console.log(
    `[server] Cureocity backend listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
});

export { httpServer, io };
