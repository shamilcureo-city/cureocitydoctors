import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app.js';
import { config } from './config/index.js';
import { setupAmbientHandlers } from './services/ambient.js';

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

// Set up all real-time handlers (ambient, KBE live, safety-net)
setupAmbientHandlers(io);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
httpServer.listen(config.port, () => {
  console.log(
    `[server] Cureocity backend listening on http://localhost:${config.port} (${config.nodeEnv})`,
  );
});

export { httpServer, io };
