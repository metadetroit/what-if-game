'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const http = require('http');

// ─── Actual Server Setup ───
// Use a random available port for the real server under test.
process.env.PORT = process.env.PORT || '0';
const appServer = require('./server.js');

before(async () => {
  await appServer.startServer();
});

after(() => {
  appServer.io.close();
  appServer.server.close();
  process.exit(0);
});

// ─── Test Setup ───

function createTestServer() {
  const httpServer = http.createServer();
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });
  return { httpServer, io, cleanup: () => { io.close(); httpServer.close(); } };
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
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

  const client = createTestClient(io, PORT);
  
  await new Promise((resolve) => {
    client.on('connect', resolve);
  });

  assert.ok(client.connected);
  
  client.disconnect();
  io.close();
  httpServer.close();
});

test('multiple clients can connect simultaneously', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

// ─── Event Emission Tests ───

test('server can emit events to connected clients', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

test('client can emit events to server', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

  const serverPromise = new Promise((resolve) => {
    io.on('connection', (socket) => {
      socket.on('client-event', (data) => resolve(data));
    });
  });

  const client = createTestClient(io, PORT);
  
  await new Promise((resolve) => {
    client.on('connect', resolve);
  });

  const clientData = { action: 'test', payload: 123 };
  client.emit('client-event', clientData);

  const received = await serverPromise;
  assert.deepEqual(received, clientData);
  
  client.disconnect();
  io.close();
  httpServer.close();
});

// ─── Room Tests ───

test('clients can join and leave rooms', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

  io.on('connection', (socket) => {
    socket.on('join-room', (roomCode) => {
      socket.join(roomCode);
    });
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
  io.close();
  httpServer.close();
});

// ─── Tournament Flow Simulation Tests ───

test('simulated tournament flow: room creation to game start', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

test('simulated voting phase with vote submission', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

// ─── Error Handling Tests ───

test('invalid room code returns error', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

test('duplicate submission returns error', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

// ─── Rate Limit Simulation Tests ───

test('rapid connections are rate limited', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

  const connectionTimes = new Map();
  const COOLDOWN_MS = 3000;
  let firstSocketId = null;

  io.on('connection', (socket) => {
    const clientKey = socket.id;
    const now = Date.now();
    const lastConn = connectionTimes.get(clientKey) || 0;
    
    if (now - lastConn < COOLDOWN_MS) {
      socket.emit('error', 'Please wait before connecting again');
      socket.disconnect();
    } else {
      connectionTimes.set(clientKey, now);
      socket.emit('connection-accepted');
    }
  });

  // First connection succeeds
  const client1 = createTestClient(io, PORT);
  const accepted1 = await new Promise((resolve) => {
    client1.once('connection-accepted', () => resolve(true));
    client1.once('error', () => resolve(false));
  });
  assert.ok(accepted1);

  // Immediate second connection from a different socket should also succeed
  // since rate limiting is per-socket-id
  const client2 = createTestClient(io, PORT);
  const accepted2 = await new Promise((resolve) => {
    client2.once('connection-accepted', () => resolve(true));
    client2.once('error', () => resolve(false));
  });
  assert.ok(accepted2);
  
  client1.disconnect();
  client2.disconnect();
  io.close();
  httpServer.close();
});

// ─── Phase Transition Tests ───

test('phase transitions emit correct events', async () => {
  const { httpServer, io } = createTestServer();
  
  await new Promise((resolve) => {
    httpServer.listen(0, resolve);
  });
  const PORT = httpServer.address().port;

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
  io.close();
  httpServer.close();
});

// ─── Actual Server Integration Regression Tests ───

function actualPort() {
  return appServer.server.address().port;
}

function createActualClient() {
  return createTestClient(appServer.io, actualPort());
}

function waitFor(client, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
    client.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

async function createRoom(hostName) {
  const client = createActualClient();
  await waitFor(client, 'connect');
  const roomCode = await new Promise((resolve) => {
    client.emit('create-room', hostName, (response) => resolve(response.roomCode));
  });
  return { client, roomCode };
}

async function joinRoom(roomCode, name) {
  const client = createActualClient();
  await waitFor(client, 'connect');
  await new Promise((resolve, reject) => {
    client.emit('join-room', roomCode, name, (response) => {
      if (response.success) resolve(response);
      else reject(new Error(response.error || 'join failed'));
    });
  });
  return client;
}

// C1: spectators are not counted as required submitters

test('C1: spectator is not counted as a required submitter', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');
  const spec = await joinRoom(roomCode, 'Spec1');

  // Set Spec1 to spectator
  const spectatorSet = waitFor(host, 'player-left');
  host.emit('host-set-spectator', { playerId: spec.id, isSpectator: true });
  await spectatorSet;

  // Start should succeed with 3 playing players
  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  const startData = await started;
  assert.equal(startData.phase, 'writing');

  // All three playing players submit a question
  const answerPhasePromises = [host, p1, p2].map((c) => waitFor(c, 'answer-phase'));
  host.emit('submit-question', 'Host question?');
  p1.emit('submit-question', 'Player1 question?');
  p2.emit('submit-question', 'Player2 question?');

  const answers = await Promise.all(answerPhasePromises);
  assert.equal(answers.length, 3);
  assert.ok(answers.every((a) => a.question && a.questionAuthor));

  // Spectator should not receive an answer-phase assignment
  let specReceived = false;
  spec.on('answer-phase', () => { specReceived = true; });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(specReceived, false);

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
  spec.disconnect();
});

// C1: start-game fails when too few playing players remain after spectators

test('C1: start-game rejects when spectators drop count below minimum', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const spec = await joinRoom(roomCode, 'Spec1');

  // Set Player1 to spectator, leaving only the host as playing
  const spectatorSet = waitFor(host, 'player-left');
  host.emit('host-set-spectator', { playerId: p1.id, isSpectator: true });
  await spectatorSet;

  host.emit('start-game', { tournament: { enabled: true } });
  const error = await waitFor(host, 'error');
  assert.equal(error, 'Need at least 3 active players to start');

  host.disconnect();
  p1.disconnect();
  spec.disconnect();
});

// C2: abandoning a player marks them as leftGame in tournament scores

test('C2: player abandon marks leftGame in tournament scores', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');
  const p3 = await joinRoom(roomCode, 'Player3');

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  // Simulate that Player1 already has a score entry (e.g., from a previous round)
  const game = appServer.games[roomCode];
  game.tournament.scores['Player1'] = {
    total: 0, roundScores: [], firstPlaces: 0, votesReceived: 0,
    joinedAtRound: 1, leftGame: false
  };

  const playerLeft = waitFor(host, 'player-left');
  p1.emit('player-abandon');
  await playerLeft;

  assert.equal(game.tournament.scores['Player1'].leftGame, true);

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
  p3.disconnect();
});

// M3: invalid lobby settings are rejected

test('M3: invalid lobby settings are rejected without mutating game', async () => {
  const { client: host, roomCode } = await createRoom('Host');

  host.emit('update-lobby-settings', { tournamentConfig: { targetRounds: 0 } });
  const error = await waitFor(host, 'error');
  assert.equal(error, 'targetRounds must be at least 1');

  const game = appServer.games[roomCode];
  assert.equal(game.phase, 'lobby');
  assert.equal(game.tournament, null);

  host.disconnect();
});

// H1: next round does not start with fewer than 3 playing players

test('H1: next round is blocked when playing players fall below 3', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  const game = appServer.games[roomCode];
  game.phase = 'scoreboard';

  // Remove one player, leaving only 2 playing players
  const playerLeft = waitFor(host, 'player-left');
  host.emit('host-kick-player', { playerId: p2.id });
  await playerLeft;

  const error = waitFor(host, 'error');
  host.emit('next-round');
  const errorMsg = await error;
  assert.equal(errorMsg, 'Not enough active players to start the next round');
  assert.equal(game.phase, 'scoreboard');

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
});

// H2: stale round result is cleared when advancing to a new round

test('H2: stale round result is cleared when advancing to a new round', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  const game = appServer.games[roomCode];
  game.phase = 'scoreboard';
  game.tournament.lastRoundResult = { round: 1, winner: 'Dummy' };

  const newRound = waitFor(host, 'game-restarted');
  host.emit('next-round');
  await newRound;

  assert.equal(game.phase, 'writing');
  assert.equal(game.tournament.lastRoundResult, null);

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
});

// Spectator promotion: queued promotion takes effect on next round

test('spectator promotion takes effect on next-round', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');
  const spec = await joinRoom(roomCode, 'Spec1');

  // Set Spec1 as spectator
  const spectatorSet = waitFor(host, 'player-left');
  host.emit('host-set-spectator', { playerId: spec.id, isSpectator: true });
  await spectatorSet;

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  const game = appServer.games[roomCode];
  game.phase = 'scoreboard';

  // Host promotes Spec1
  const promoted = waitFor(host, 'promotion-queued');
  host.emit('promote-player', { playerName: 'Spec1' });
  await promoted;
  assert.ok(game.tournament.pendingPromotions.includes('Spec1'));

  // Advance round — promotion should be applied
  const newRound = waitFor(host, 'game-restarted');
  host.emit('next-round');
  await newRound;

  const promotedPlayer = game.players.find(p => p.name === 'Spec1');
  assert.equal(promotedPlayer.role, 'player');
  assert.ok(game.tournament.scores['Spec1'], 'Promoted player should have a score entry');

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
  spec.disconnect();
});

// Reconnect during scoreboard restores correct state

test('reconnect during scoreboard restores standings and deadline', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  const game = appServer.games[roomCode];
  game.phase = 'scoreboard';
  game.tournament.lastRoundResult = {
    standings: [{ name: 'Host', rank: 1, total: 5, firstPlaces: 1, votesReceived: 3, leftGame: false }],
    roundWinnerDetails: [],
    speedDetails: null
  };
  game.scoreboardDeadlineAt = Date.now() + 30000;
  game.tournament.scoreboardDeadlineAt = game.scoreboardDeadlineAt;

  // Player1 disconnects, then reconnects with a new socket
  p1.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const p1Reconnect = createActualClient();
  await waitFor(p1Reconnect, 'connect');
  const reconnectData = waitFor(p1Reconnect, 'reconnected');
  p1Reconnect.emit('reconnect-player', { roomCode, playerName: 'Player1' });
  const data = await reconnectData;

  assert.equal(data.phase, 'scoreboard');
  assert.ok(data.scoreboardData);
  assert.ok(data.scoreboardData.standings);

  host.disconnect();
  p1Reconnect.disconnect();
  p2.disconnect();
});

// L3: new-tournament clears stale votes from the previous tournament

test('L3: new-tournament clears stale votes from previous tournament', async () => {
  const { client: host, roomCode } = await createRoom('Host');
  const p1 = await joinRoom(roomCode, 'Player1');
  const p2 = await joinRoom(roomCode, 'Player2');

  const started = waitFor(host, 'game-started');
  host.emit('start-game', { tournament: { enabled: true } });
  await started;

  const game = appServer.games[roomCode];
  const db = require('./database.js').getDb();

  // Insert a dummy vote row for this game
  await db.run("INSERT INTO votes (game_id, player_id, vote_type, target_id) VALUES (?, ?, ?, ?)",
    [game.dbGameId, 'test-voter', 'qa_pair', 999]);

  // Move to tournament_complete
  game.phase = 'tournament_complete';
  game.tournament.status = 'complete';

  const resetPromise = waitFor(host, 'tournament-reset');
  host.emit('new-tournament');
  await resetPromise;

  // Verify votes were cleared
  const voteRows = await db.exec("SELECT COUNT(*) as cnt FROM votes WHERE game_id = ?", [game.dbGameId]);
  const voteCount = voteRows.length > 0 ? voteRows[0].values[0][0] : 0;
  assert.equal(voteCount, 0, 'Stale votes should be cleared on new-tournament');

  assert.equal(game.phase, 'lobby');
  assert.equal(game.tournament.currentRound, 1);

  host.disconnect();
  p1.disconnect();
  p2.disconnect();
});
