'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const http = require('http');

// ─── Test Setup ───

function createTestServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });
  return { httpServer, io };
}

function createTestClient(io, port) {
  return ioClient(`http://localhost:${port}`, {
    transports: ['websocket'],
    forceNew: true
  });
}

// ─── Socket Connection Tests ───

test('socket client can connect and disconnect', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3456;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const client = createTestClient(io, PORT);
  
  await new Promise((resolve) => {
    client.on('connect', resolve);
  });

  assert.ok(client.connected);
  
  client.disconnect();
  httpServer.close();
});

test('multiple clients can connect simultaneously', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3457;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const clients = [];
  for (let i = 0; i < 5; i++) {
    const client = createTestClient(io, PORT);
    await new Promise((resolve) => {
      client.on('connect', resolve);
    });
    clients.push(client);
  }

  assert.equal(clients.length, 5);
  clients.forEach(c => assert.ok(c.connected));
  
  clients.forEach(c => c.disconnect());
  httpServer.close();
});

// ─── Event Emission Tests ───

test('server can emit events to connected clients', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3458;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const client = createTestClient(io, PORT);
  
  await new Promise((resolve) => {
    client.on('connect', resolve);
  });

  const eventData = { message: 'test', value: 42 };
  
  io.emit('test-event', eventData);
  
  const received = await new Promise((resolve) => {
    client.on('test-event', (data) => resolve(data));
  });

  assert.deepEqual(received, eventData);
  
  client.disconnect();
  httpServer.close();
});

test('client can emit events to server', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3459;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const client = createTestClient(io, PORT);
  
  await new Promise((resolve) => {
    client.on('connect', resolve);
  });

  const serverPromise = new Promise((resolve) => {
    io.on('connection', (socket) => {
      socket.on('client-event', (data) => resolve(data));
    });
  });

  const clientData = { action: 'test', payload: 123 };
  client.emit('client-event', clientData);

  const received = await serverPromise;
  assert.deepEqual(received, clientData);
  
  client.disconnect();
  httpServer.close();
});

// ─── Room Tests ───

test('clients can join and leave rooms', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3460;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const client1 = createTestClient(io, PORT);
  const client2 = createTestClient(io, PORT);
  
  await Promise.all([
    new Promise((resolve) => client1.on('connect', resolve)),
    new Promise((resolve) => client2.on('connect', resolve))
  ]);

  client1.emit('join-room', 'test-room');
  client2.emit('join-room', 'test-room');

  await new Promise((resolve) => setTimeout(resolve, 100));

  io.to('test-room').emit('room-message', { text: 'hello' });

  const messages = [];
  const messagePromise = new Promise((resolve) => {
    const handler = (data) => {
      messages.push(data);
      if (messages.length === 2) resolve();
    };
    client1.on('room-message', handler);
    client2.on('room-message', handler);
  });

  await messagePromise;
  assert.equal(messages.length, 2);
  
  client1.disconnect();
  client2.disconnect();
  httpServer.close();
});

// ─── Tournament Flow Simulation Tests ───

test('simulated tournament flow: room creation to game start', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3461;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  // Simulate room creation event
  io.on('connection', (socket) => {
    socket.on('create-room', (playerName, callback) => {
      const roomCode = 'TEST123';
      socket.join(roomCode);
      socket.roomCode = roomCode;
      callback({ success: true, roomCode });
      io.to(roomCode).emit('player-joined', { 
        players: [{ id: socket.id, name: playerName, isHost: true }],
        hostId: socket.id 
      });
    });

    socket.on('join-room', (roomCode, playerName, callback) => {
      socket.join(roomCode);
      socket.roomCode = roomCode;
      callback({ success: true });
      io.to(roomCode).emit('player-joined', { 
        players: [{ id: socket.id, name: playerName, isHost: false }],
        hostId: 'host-id'
      });
    });

    socket.on('start-game', ({ tournament }) => {
      const roomCode = socket.roomCode;
      io.to(roomCode).emit('game-started', {
        phase: 'writing',
        tournament: tournament || null
      });
    });
  });

  const host = createTestClient(io, PORT);
  await new Promise((resolve) => host.on('connect', resolve));

  // Host creates room
  const roomCode = await new Promise((resolve) => {
    host.emit('create-room', 'TestHost', (response) => {
      resolve(response.roomCode);
    });
  });

  assert.equal(roomCode, 'TEST123');

  // Players join
  const players = [];
  for (let i = 1; i <= 3; i++) {
    const player = createTestClient(io, PORT);
    await new Promise((resolve) => player.on('connect', resolve));
    
    await new Promise((resolve) => {
      player.emit('join-room', roomCode, `Player${i}`, (response) => {
        assert.ok(response.success);
        resolve();
      });
    });
    players.push(player);
  }

  // Host starts game with tournament
  const gameStarted = await new Promise((resolve) => {
    host.on('game-started', (data) => resolve(data));
    host.emit('start-game', {
      tournament: { enabled: true, targetRounds: 3, speedScoringEnabled: true }
    });
  });

  assert.equal(gameStarted.phase, 'writing');
  assert.ok(gameStarted.tournament.enabled);
  
  [host, ...players].forEach(c => c.disconnect());
  httpServer.close();
});

test('simulated voting phase with vote submission', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3462;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const votes = {};
  
  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode) => {
      socket.join(roomCode);
      socket.roomCode = roomCode;
    });

    socket.on('submit-vote', ({ type, targetId }) => {
      const roomCode = socket.roomCode;
      if (!votes[roomCode]) votes[roomCode] = {};
      if (!votes[roomCode][targetId]) votes[roomCode][targetId] = 0;
      votes[roomCode][targetId]++;
      
      socket.emit('vote-submitted', { success: true, targetId, voteCount: votes[roomCode][targetId] });
      io.to(roomCode).emit('vote-update', { type, targetId, voteCount: votes[roomCode][targetId] });
    });

    socket.on('finish-voting', () => {
      const roomCode = socket.roomCode;
      io.to(roomCode).emit('scoreboard', {
        standings: [],
        currentRound: 1,
        targetRounds: 3,
        isFinalRound: false
      });
    });
  });

  const clients = [];
  for (let i = 0; i < 4; i++) {
    const client = createTestClient(io, PORT);
    await new Promise((resolve) => client.on('connect', resolve));
    client.emit('join-room', 'VOTE-ROOM');
    clients.push(client);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  // Submit votes
  const votePromises = clients.map((client, i) => {
    return new Promise((resolve) => {
      client.on('vote-submitted', (data) => {
        assert.ok(data.success);
        resolve();
      });
      client.emit('submit-vote', { type: 'qa_pair', targetId: 1 });
    });
  });

  await Promise.all(votePromises);

  // Finish voting
  const scoreboard = await new Promise((resolve) => {
    clients[0].on('scoreboard', (data) => resolve(data));
    clients[0].emit('finish-voting');
  });

  assert.equal(scoreboard.currentRound, 1);
  assert.equal(scoreboard.targetRounds, 3);
  
  clients.forEach(c => c.disconnect());
  httpServer.close();
});

// ─── Error Handling Tests ───

test('invalid room code returns error', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3463;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode, playerName, callback) => {
      if (roomCode !== 'VALID-ROOM') {
        callback({ success: false, error: 'Room not found' });
      } else {
        socket.join(roomCode);
        callback({ success: true });
      }
    });
  });

  const client = createTestClient(io, PORT);
  await new Promise((resolve) => client.on('connect', resolve));

  const response = await new Promise((resolve) => {
    client.emit('join-room', 'INVALID-ROOM', 'TestPlayer', (response) => {
      resolve(response);
    });
  });

  assert.equal(response.success, false);
  assert.equal(response.error, 'Room not found');
  
  client.disconnect();
  httpServer.close();
});

test('duplicate submission returns error', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3464;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const submissions = new Set();
  
  io.on('connection', (socket) => {
    socket.on('submit-question', (question) => {
      if (submissions.has(socket.id)) {
        socket.emit('error', 'You already submitted');
      } else {
        submissions.add(socket.id);
        socket.emit('question-submitted');
      }
    });
  });

  const client = createTestClient(io, PORT);
  await new Promise((resolve) => client.on('connect', resolve));

  // First submission succeeds
  await new Promise((resolve) => {
    client.on('question-submitted', resolve);
    client.emit('submit-question', 'What if test?');
  });

  // Second submission fails
  const error = await new Promise((resolve) => {
    client.on('error', (msg) => resolve(msg));
    client.emit('submit-question', 'What if test again?');
  });

  assert.equal(error, 'You already submitted');
  
  client.disconnect();
  httpServer.close();
});

// ─── Rate Limit Simulation Tests ───

test('rapid connections are rate limited', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3465;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const connectionTimes = new Map();
  const COOLDOWN_MS = 3000;
  
  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address || socket.id;
    const now = Date.now();
    const lastConn = connectionTimes.get(clientIp) || 0;
    
    if (now - lastConn < COOLDOWN_MS) {
      socket.emit('error', 'Please wait before connecting again');
      socket.disconnect();
    } else {
      connectionTimes.set(clientIp, now);
      socket.emit('connection-accepted');
    }
  });

  // First connection succeeds
  const client1 = createTestClient(io, PORT);
  const accepted1 = await new Promise((resolve) => {
    client1.on('connection-accepted', resolve);
    client1.on('error', () => resolve(false));
  });
  assert.ok(accepted1);

  // Immediate second connection fails
  const client2 = createTestClient(io, PORT);
  const accepted2 = await new Promise((resolve) => {
    client2.on('connection-accepted', resolve);
    client2.on('error', () => resolve(false));
  });
  assert.equal(accepted2, false);
  
  client1.disconnect();
  client2.disconnect();
  httpServer.close();
});

// ─── Phase Transition Tests ───

test('phase transitions emit correct events', async () => {
  const { httpServer, io } = createTestServer();
  const PORT = 3466;
  
  await new Promise((resolve) => {
    httpServer.listen(PORT, resolve);
  });

  const phases = ['writing', 'answering', 'performing', 'voting', 'scoreboard'];
  let currentPhaseIndex = 0;
  
  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode) => {
      socket.join(roomCode);
      socket.roomCode = roomCode;
    });

    socket.on('advance-phase', () => {
      const roomCode = socket.roomCode;
      if (currentPhaseIndex < phases.length) {
        const phase = phases[currentPhaseIndex];
        io.to(roomCode).emit('phase-changed', { phase });
        currentPhaseIndex++;
      }
    });
  });

  const client = createTestClient(io, PORT);
  await new Promise((resolve) => client.on('connect', resolve));
  client.emit('join-room', 'PHASE-ROOM');

  await new Promise((resolve) => setTimeout(resolve, 50));

  const receivedPhases = [];
  for (let i = 0; i < phases.length; i++) {
    const phaseData = await new Promise((resolve) => {
      client.on('phase-changed', (data) => resolve(data));
      client.emit('advance-phase');
    });
    receivedPhases.push(phaseData.phase);
  }

  assert.deepEqual(receivedPhases, phases);
  
  client.disconnect();
  httpServer.close();
});
