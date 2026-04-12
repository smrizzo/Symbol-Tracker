require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Validate required environment variables at startup
if (!process.env.ADMIN_CODE) {
  console.error('ERROR: ADMIN_CODE environment variable is required but not set.');
  console.error('Copy server/.env.example to server/.env and fill in your values.');
  process.exit(1);
}

// Hash the admin code at startup. The salt is kept so the client can request
// it and hash the typed password with the same salt before sending — this
// means the plaintext never travels over the network.
// Both SALT and ADMIN_HASH live only in server memory; no plaintext is retained.
const SALT = bcrypt.genSaltSync(10);
const ADMIN_HASH = bcrypt.hashSync(process.env.ADMIN_CODE, SALT);
delete process.env.ADMIN_CODE; // remove plaintext from the environment

const PORT = process.env.PORT || 3000;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Session state - only one session at a time
let session = null;

// Generate a unique session ID
function generateSessionId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `RAID-${num}`;
}

// Get players list for broadcast
function getPlayersList() {
  if (!session) return [];
  return Array.from(session.players.values()).map(p => ({
    socketId: p.socketId,
    name: p.name,
    role: p.role
  }));
}

// Broadcast players update to all in session
function broadcastPlayersUpdate() {
  if (!session) return;
  io.to(session.id).emit('players_update', getPlayersList());
}

// Check if session should be deleted (no players left)
function checkSessionCleanup() {
  if (session && session.players.size === 0) {
    console.log(`[SERVER] Session ${session.id} deleted - all players disconnected`);
    session = null;
  }
}

io.on('connection', (socket) => {
  console.log(`[SERVER] Client connected: ${socket.id}`);

  // Provide the bcrypt salt so the client can hash before transmitting.
  // The hash is deterministic: same salt + same password = same hash, so
  // the server can validate by comparing hashes directly without ever
  // receiving or storing the plaintext.
  socket.on('get_salt', (callback) => {
    console.log(`[SERVER] get_salt requested by ${socket.id}`);
    if (typeof callback === 'function') {
      callback({ salt: SALT });
    }
  });

  // Admin creates a session
  socket.on('create_session', (data) => {
    const { adminHash } = data;
    console.log(`[SERVER] create_session received from ${socket.id}`);

    // The client hashes the typed password with the server's salt before
    // sending. Both sides used bcrypt with the same salt, so the hashes
    // are identical strings iff the passwords match. We use timingSafeEqual
    // to avoid leaking information via response timing.
    let isValid = false;
    try {
      const received = Buffer.from(adminHash || '', 'utf8');
      const stored = Buffer.from(ADMIN_HASH, 'utf8');
      isValid = received.length === stored.length &&
                crypto.timingSafeEqual(received, stored);
    } catch {
      isValid = false;
    }

    if (!isValid) {
      console.log(`[SERVER] Auth failed for ${socket.id} - invalid admin hash`);
      socket.emit('auth_error', { message: 'Invalid admin code' });
      return;
    }

    // Check if session already exists
    if (session) {
      console.log(`[SERVER] Auth failed for ${socket.id} - session already active (${session.id})`);
      socket.emit('auth_error', { message: 'A session is already active' });
      return;
    }

    // Create new session
    const sessionId = generateSessionId();
    session = {
      id: sessionId,
      adminSocketId: socket.id,
      players: new Map(),
      symbolSequence: []
    };

    // Add admin to session
    session.players.set(socket.id, {
      socketId: socket.id,
      name: 'Admin',
      role: 'admin'
    });

    socket.join(sessionId);

    socket.emit('session_created', {
      sessionId,
      role: 'admin',
      symbolSequence: []
    });

    broadcastPlayersUpdate();
    console.log(`[SERVER] Session created: ${sessionId} by admin ${socket.id}`);
  });

  // Player joins a session
  socket.on('join_session', (data) => {
    const { name, sessionId } = data;
    console.log(`[SERVER] join_session received: name="${name}" sessionId="${sessionId}" from ${socket.id}`);

    // Validate session exists
    if (!session || session.id !== sessionId) {
      console.log(`[SERVER] join_error: session "${sessionId}" not found`);
      socket.emit('join_error', { message: 'Session not found' });
      return;
    }

    // Check if name is taken
    for (const player of session.players.values()) {
      if (player.name.toLowerCase() === name.toLowerCase()) {
        console.log(`[SERVER] join_error: name "${name}" already taken in ${sessionId}`);
        socket.emit('join_error', { message: 'Name already taken' });
        return;
      }
    }

    // Add player to session
    session.players.set(socket.id, {
      socketId: socket.id,
      name: name,
      role: 'raider'
    });

    socket.join(sessionId);

    socket.emit('join_success', {
      sessionId,
      role: 'raider',
      symbolSequence: session.symbolSequence
    });

    broadcastPlayersUpdate();
    console.log(`[SERVER] Player "${name}" joined session ${sessionId} (${session.players.size} players total)`);
  });

  // Admin assigns role to a player
  socket.on('assign_role', (data) => {
    const { socketId, role } = data;

    if (!session) return;

    // Verify sender is admin
    const sender = session.players.get(socket.id);
    if (!sender || sender.role !== 'admin') {
      return;
    }

    // Update player role
    const player = session.players.get(socketId);
    if (player && player.role !== 'admin') {
      player.role = role;

      // Emit role update to all
      io.to(session.id).emit('role_update', {
        socketId: player.socketId,
        name: player.name,
        role: player.role
      });

      broadcastPlayersUpdate();
      console.log(`[SERVER] Role updated: "${player.name}" is now ${role} in ${session.id}`);
    }
  });

  // Raid Leader adds a symbol
  socket.on('symbol_add', (data) => {
    const { symbol } = data;

    if (!session) return;

    // Verify sender is admin or raid leader
    const sender = session.players.get(socket.id);
    if (!sender || (sender.role !== 'admin' && sender.role !== 'leader')) {
      return;
    }

    // Check max 5 symbols and no duplicates
    if (session.symbolSequence.length >= 5) return;
    if (session.symbolSequence.includes(symbol)) return;

    session.symbolSequence.push(symbol);

    io.to(session.id).emit('state_update', {
      symbolSequence: session.symbolSequence
    });

    console.log(`[SERVER] symbol_add: "${symbol}" by ${socket.id} | sequence: [${session.symbolSequence.join(', ')}] | broadcasting to ${session.players.size} players`);
  });

  // Reset the symbol sequence
  socket.on('reset', () => {
    if (!session) return;

    // Verify sender is admin or raid leader
    const sender = session.players.get(socket.id);
    if (!sender || (sender.role !== 'admin' && sender.role !== 'leader')) {
      return;
    }

    session.symbolSequence = [];

    io.to(session.id).emit('state_reset');
    console.log(`[SERVER] reset by ${socket.id} | broadcasting to ${session.players.size} players`);
  });

  // Admin closes session
  socket.on('close_session', () => {
    if (!session) return;

    // Verify sender is admin
    const sender = session.players.get(socket.id);
    if (!sender || sender.role !== 'admin') {
      return;
    }

    io.to(session.id).emit('session_closed');

    // Disconnect all sockets from room
    const roomSockets = io.sockets.adapter.rooms.get(session.id);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const s = io.sockets.sockets.get(socketId);
        if (s) s.leave(session.id);
      }
    }

    console.log(`[SERVER] Session ${session.id} closed by admin ${socket.id}`);
    session = null;
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`[SERVER] Client disconnected: ${socket.id} (reason: ${reason})`);

    if (!session) return;

    const player = session.players.get(socket.id);
    if (player) {
      // If admin disconnects, close the session
      if (player.role === 'admin') {
        io.to(session.id).emit('session_closed');
        console.log(`[SERVER] Session ${session.id} closed - admin disconnected`);
        session = null;
      } else {
        // Remove player from session
        session.players.delete(socket.id);
        console.log(`[SERVER] Player "${player.name}" removed from ${session.id} (${session.players.size} players remaining)`);
        broadcastPlayersUpdate();
        checkSessionCleanup();
      }
    }
  });

  // Request current state (for reconnection)
  socket.on('request_state', () => {
    if (session && session.players.has(socket.id)) {
      console.log(`[SERVER] state_sync sent to ${socket.id} | sequence: [${session.symbolSequence.join(', ')}]`);
      socket.emit('state_sync', {
        symbolSequence: session.symbolSequence
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`[SERVER] SymbolTracker server running on port ${PORT}`);
});
