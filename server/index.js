const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const ADMIN_CODE = process.env.ADMIN_CODE || 'changeme';

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
    console.log(`Session ${session.id} deleted - all players disconnected`);
    session = null;
  }
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Admin creates a session
  socket.on('create_session', (data) => {
    const { adminCode } = data;

    // Validate admin code
    if (adminCode !== ADMIN_CODE) {
      socket.emit('auth_error', { message: 'Invalid admin code' });
      return;
    }

    // Check if session already exists
    if (session) {
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
    console.log(`Session created: ${sessionId} by admin ${socket.id}`);
  });

  // Player joins a session
  socket.on('join_session', (data) => {
    const { name, sessionId } = data;

    // Validate session exists
    if (!session || session.id !== sessionId) {
      socket.emit('join_error', { message: 'Session not found' });
      return;
    }

    // Check if name is taken
    for (const player of session.players.values()) {
      if (player.name.toLowerCase() === name.toLowerCase()) {
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
    console.log(`Player ${name} joined session ${sessionId}`);
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
      console.log(`Role updated: ${player.name} is now ${role}`);
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

    console.log(`Symbol added: ${symbol}, sequence: ${session.symbolSequence}`);
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
    console.log('Symbol sequence reset');
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

    console.log(`Session ${session.id} closed by admin`);
    session = null;
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    if (!session) return;

    const player = session.players.get(socket.id);
    if (player) {
      // If admin disconnects, close the session
      if (player.role === 'admin') {
        io.to(session.id).emit('session_closed');
        console.log(`Session ${session.id} closed - admin disconnected`);
        session = null;
      } else {
        // Remove player from session
        session.players.delete(socket.id);
        broadcastPlayersUpdate();
        checkSessionCleanup();
      }
    }
  });

  // Request current state (for reconnection)
  socket.on('request_state', () => {
    if (session && session.players.has(socket.id)) {
      socket.emit('state_sync', {
        symbolSequence: session.symbolSequence
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`SymbolTracker server running on port ${PORT}`);
  console.log(`Admin code: ${ADMIN_CODE === 'changeme' ? 'changeme (default)' : '(custom)'}`);
});
