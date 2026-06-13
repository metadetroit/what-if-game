const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase, getDb, saveDatabase } = require('./database');

const app = express();

// CORS configuration for production
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Health check endpoint for Render.com
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'what-if-game-backend', players: Object.values(games).reduce((acc, g) => acc + g.players.length, 0) });
});

// API: Get best of content
app.get('/api/best-of', (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 20;
  const type = req.query.type; // 'questions', 'answers', 'qa_pairs', or undefined for all
  const sort = (req.query.sort || 'votes').toLowerCase(); // 'votes' | 'newest'
  const offset = parseInt(req.query.offset) || 0;

  let results = [];

  if (!type || type === 'questions') {
    const orderByQuestions = sort === 'newest' ? 'g.created_at DESC' : 'q.vote_count DESC';
    const questions = db.exec(`
      SELECT q.id, q.text, q.author_name, q.vote_count, g.created_at, q.anonymous
      FROM questions q
      JOIN games g ON q.game_id = g.id
      WHERE g.hidden_from_best_of = 0
      ORDER BY ${orderByQuestions}
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    if (questions.length > 0) {
      questions[0].values.forEach(row => {
        // columns: 0 id, 1 text, 2 author_name, 3 vote_count, 4 created_at, 5 anonymous
        const isAnon = row[5] === 1 || row[5] === true;
        results.push({
          type: 'question',
          id: row[0],
          content: row[1],
          author: isAnon ? '???' : (row[2] || 'Unknown'),
          vote_count: row[3],
          game_date: row[4]
        });
      });
    }
  }

  if (!type || type === 'answers') {
    const orderByAnswers = sort === 'newest' ? 'g.created_at DESC' : 'a.vote_count DESC';
    const answers = db.exec(`
      SELECT a.id, a.text, a.author_name, a.vote_count, g.created_at, a.anonymous
      FROM answers a
      JOIN games g ON a.game_id = g.id
      WHERE g.hidden_from_best_of = 0
      ORDER BY ${orderByAnswers}
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    if (answers.length > 0) {
      answers[0].values.forEach(row => {
        // columns: 0 id, 1 text, 2 author_name, 3 vote_count, 4 created_at, 5 anonymous
        const isAnon = row[5] === 1 || row[5] === true;
        results.push({
          type: 'answer',
          id: row[0],
          content: row[1],
          author: isAnon ? '???' : (row[2] || 'Unknown'),
          vote_count: row[3],
          game_date: row[4]
        });
      });
    }
  }

  if (!type || type === 'qa_pairs') {
    const orderByPairs = sort === 'newest' ? 'g.created_at DESC' : 'qp.vote_count DESC';
    const pairs = db.exec(`
      SELECT qp.id, q.text as question_text, a.text as answer_text, 
             q.author_name as question_author, a.author_name as answer_author,
             qp.vote_count, g.created_at, qp.anonymous
      FROM qa_pairs qp
      JOIN questions q ON qp.question_id = q.id
      JOIN answers a ON qp.answer_id = a.id
      JOIN games g ON qp.game_id = g.id
      WHERE g.hidden_from_best_of = 0
      ORDER BY ${orderByPairs}
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    if (pairs.length > 0) {
      pairs[0].values.forEach(row => {
        // columns: 0 id, 1 q_text, 2 a_text, 3 q_author, 4 a_author, 5 vote, 6 created, 7 anonymous
        const isAnon = row[7] === 1 || row[7] === true;
        results.push({
          type: 'qa_pair',
          id: row[0],
          question: row[1],
          answer: row[2],
          question_author: isAnon ? '???' : (row[3] || 'Unknown'),
          answer_author: isAnon ? '???' : (row[4] || 'Unknown'),
          vote_count: row[5],
          game_date: row[6]
        });
      });
    }
  }

  // Sort by vote count if mixed types
  if (!type) {
    results.sort((a, b) => b.vote_count - a.vote_count);
    results = results.slice(0, limit);
  }

  res.json(results);
});

// API: Hide game from best of page
app.post('/api/hide-game', (req, res) => {
  const { roomCode } = req.body;
  
  if (!roomCode) {
    return res.status(400).json({ success: false, error: 'roomCode required' });
  }

  const db = getDb();
  const result = db.exec("UPDATE games SET hidden_from_best_of = 1 WHERE room_code = ?", [roomCode]);
  
  saveDatabase();
  
  res.json({ success: true });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

// Store games in memory (use Redis for production)
const games = {};

function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// Permanently remove a player from a game's state. Returns the removed player object (or null).
// Cleans up keyed state (questions, answers, assignments) and rewrites references inside
// cardPairs/turnLog/cardAssignments so summaries continue to render the cached author name.
function removePlayerFromGame(roomCode, socketId) {
  const game = games[roomCode];
  if (!game) return null;
  const player = game.players.find(p => p.id === socketId);
  if (!player) return null;
  if (player.reconnectTimeout) {
    clearTimeout(player.reconnectTimeout);
    player.reconnectTimeout = null;
  }
  game.players = game.players.filter(p => p.id !== socketId);
  delete game.questions[socketId];
  delete game.answers[socketId];
  if (game.questionAssignments) delete game.questionAssignments[socketId];
  if (game.cardAssignments) {
    delete game.cardAssignments[socketId];
    for (const key of Object.keys(game.cardAssignments)) {
      const card = game.cardAssignments[key];
      if (card.playerId === socketId) card.playerId = null;
      if (card.question && card.question.authorId === socketId) card.question.authorId = null;
      if (card.answer && card.answer.authorId === socketId) card.answer.authorId = null;
    }
  }
  if (Array.isArray(game.cardPairs)) {
    for (const pair of game.cardPairs) {
      if (pair.question && pair.question.authorId === socketId) pair.question.authorId = null;
      if (pair.answer && pair.answer.authorId === socketId) pair.answer.authorId = null;
    }
  }
  if (Array.isArray(game.turnLog)) {
    for (const entry of game.turnLog) {
      if (entry.questionAuthorId === socketId) entry.questionAuthorId = null;
      if (entry.actualAnswerAuthorId === socketId) entry.actualAnswerAuthorId = null;
      if (entry.pairedAnswerAuthorId === socketId) entry.pairedAnswerAuthorId = null;
    }
  }
  if (Array.isArray(game.playerOrder)) {
    const idx = game.playerOrder.indexOf(socketId);
    if (idx !== -1) game.playerOrder[idx] = null;
  }
  return player;
}

// After permanent removal, transfer host if needed. Returns true if host changed.
function ensureHost(roomCode) {
  const game = games[roomCode];
  if (!game) return false;
  
  // Check if original host is still in the game (even if disconnected)
  const originalHost = game.players.find(p => p.id === game.host);
  if (originalHost) {
    // Keep original host as host - they can reconnect within 90s
    // Only transfer if they've been permanently removed from game
    return false;
  }
  
  // Original host is gone, find a new active host
  const activeHost = game.players.find(p => p.isHost && p.isActive);
  if (activeHost) {
    if (game.host !== activeHost.id) {
      game.host = activeHost.id;
      return true;
    }
    return false;
  }
  // Clear isHost from any inactive player still flagged
  for (const p of game.players) p.isHost = false;
  const newHost = game.players.find(p => p.isActive);
  if (newHost) {
    newHost.isHost = true;
    game.host = newHost.id;
    return true;
  }
  return false;
}

// Check if remaining active players satisfy the phase minimum. If not, disband.
// Returns true if the room was disbanded.
function disbandIfBelowMinimum(roomCode) {
  const game = games[roomCode];
  if (!game) return false;
  const active = game.players.filter(p => p.isActive).length;
  let minimum = 0;
  if (game.phase === 'writing') minimum = 3;
  else if (game.phase === 'answering') minimum = 2;
  else if (game.phase === 'performing') minimum = 2;
  else return false;
  if (active < minimum) {
    console.log(`[disband] Room ${roomCode} below minimum (${active}/${minimum}) in ${game.phase}`);
    io.to(roomCode).emit('game-disbanded', {
      message: 'Not enough players remaining to continue. Returning to the new game screen.'
    });
    for (const p of game.players) {
      const s = io.sockets.sockets.get(p.id);
      if (s) {
        s.leave(roomCode);
        s.roomCode = null;
      }
      if (p.reconnectTimeout) clearTimeout(p.reconnectTimeout);
    }
    delete games[roomCode];
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // NOTE: Stale connection cleanup happens implicitly via the reconnect-player handler
  // which checks if the 'active' socket is actually dead before rejecting the reconnect.

  // Create new game room
  socket.on('create-room', (playerName, callback) => {
    const roomCode = generateRoomCode();
    
    const game = {
      host: socket.id,
      players: [{ id: socket.id, name: playerName, isHost: true, isActive: true }],
      phase: 'lobby',
      questions: {},
      answers: {},
      currentReaderIndex: 0,
      playerOrder: [],
      anonymousMode: false,
      currentRoundAnonymousMode: false
    };
    games[roomCode] = game;
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    // Save game to database
    const db = getDb();
    db.run("INSERT INTO games (room_code, anonymous_mode, hidden_from_best_of) VALUES (?, ?, ?)", [roomCode, 0, 0]);
    const gameId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    game.dbGameId = gameId;
    saveDatabase();
    
    callback({ success: true, roomCode });
    console.log(`Room ${roomCode} created by ${playerName}`);
    
    // CRITICAL FIX: Emit player-joined to update host's player list
    const activePlayers = game.players.filter(p => p.isActive);
    io.to(roomCode).emit('player-joined', { players: activePlayers, hostId: game.host });
  });

  // Join existing room
  socket.on('join-room', (roomCode, playerName, callback) => {
    const game = games[roomCode];
    
    if (!game) {
      callback({ success: false, error: 'Room not found' });
      return;
    }
    
    if (game.players.length >= 15) {
      callback({ success: false, error: 'Room is full (max 15 players)' });
      return;
    }
    
    if (game.phase !== 'lobby') {
      callback({ success: false, error: 'Game already in progress' });
      return;
    }
    
    console.log(`JOIN-ROOM: Adding ${playerName} with socket ${socket.id} to room ${roomCode}`);
    console.log(`JOIN-ROOM: Players before:`, game.players.map(p => ({ name: p.name, id: p.id, isActive: p.isActive })));
    
    game.players.push({ id: socket.id, name: playerName, isHost: false, isActive: true });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`JOIN-ROOM: Players after:`, game.players.map(p => ({ name: p.name, id: p.id, isActive: p.isActive })));
    
    callback({ success: true });
    console.log(`${playerName} joined room ${roomCode}`);
    io.to(roomCode).emit('player-joined', game.players.filter(p => p.isActive));
  });

  // Host starts the game
  socket.on('start-game', ({ noSelfReading = false }) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;
    
    // CRITICAL FIX: Use active players count for minimum check
    const activePlayers = game.players.filter(p => p.isActive);
    if (activePlayers.length < 3) {
      socket.emit('error', 'Need at least 3 active players to start');
      return;
    }
    
    // Store noSelfReading setting for use in performance phase
    game.noSelfReading = noSelfReading;
    console.log(`Room ${roomCode}: No Self-Reading ${noSelfReading ? 'ON' : 'OFF'}`);
    
    // CRITICAL FIX: Remove any disconnected players from lobby before starting
    game.players = activePlayers;
    game.phase = 'writing';
    game.currentRoundAnonymousMode = game.anonymousMode;
    io.to(roomCode).emit('game-started', { phase: 'writing', anonymousMode: game.anonymousMode });
  });

  // Host toggles anonymous mode (show/hide names in end-of-game summary)
  socket.on('toggle-anonymous', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];

    if (!game || game.host !== socket.id) return;

    game.anonymousMode = !game.anonymousMode;

    // Save to database
    const db = getDb();
    db.run("UPDATE games SET anonymous_mode = ? WHERE id = ?", [game.anonymousMode ? 1 : 0, game.dbGameId]);
    saveDatabase();

    // Broadcast to all players in the room
    io.to(roomCode).emit('anonymous-toggled', { anonymousMode: game.anonymousMode });
    console.log(`Room ${roomCode}: Anonymous mode ${game.anonymousMode ? 'ON' : 'OFF'}`);
  });

  // Player submits question
  socket.on('submit-question', (question) => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      // Filter out the socket's own room (which is always the socket.id)
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
        console.log('submit-question: using fallback roomCode from socket.rooms:', roomCode);
      }
    }
    console.log('submit-question received:', { socketId: socket.id, roomCode, question });
    const game = games[roomCode];

    if (!game) {
      console.log('submit-question rejected: game not found for roomCode:', roomCode);
      return;
    }
    if (game.phase !== 'writing') {
      console.log('submit-question rejected: game phase is not writing:', game.phase);
      return;
    }

    const player = game.players.find(p => p.id === socket.id);
    console.log('submit-question: player found:', !!player, 'player name:', player?.name);
    game.questions[socket.id] = {
      text: question,
      authorId: socket.id,
      authorName: player?.name || 'Unknown'
    };

    // Save question to database
    const db = getDb();
    db.run("INSERT INTO questions (game_id, text, author_id, author_name, vote_count, anonymous) VALUES (?, ?, ?, ?, ?, ?)", 
      [game.dbGameId, question, socket.id, player?.name || 'Unknown', 0, game.currentRoundAnonymousMode ? 1 : 0]);
    const questionId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    game.questions[socket.id].dbId = questionId;
    saveDatabase();

    // Track first submitter
    if (!game.firstQuestionSubmitter) {
      game.firstQuestionSubmitter = player?.name || 'Unknown';
    }

    // Track last submitter (always update to latest)
    game.lastQuestionSubmitter = player?.name || 'Unknown';

    socket.emit('question-submitted');
    console.log('question-submitted emitted to socket:', socket.id);

    // CRITICAL FIX: Check if all ACTIVE players submitted (not including disconnected)
    const activePlayers = game.players.filter(p => p.isActive);
    const allSubmitted = activePlayers.every(p => game.questions[p.id]);
    console.log(`Question submission check: ${Object.keys(game.questions).length}/${activePlayers.length} active players submitted`);

    if (allSubmitted) {
      console.log('All active players submitted questions - distributing...');
      // Shuffle and distribute questions (no one gets their own)
      distributeQuestions(roomCode);
    } else {
      // Only count active players in progress
      console.log('Emitting progress-update to room:', roomCode);
      io.to(roomCode).emit('progress-update', {
        submitted: Object.keys(game.questions).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: !!game.questions[p.id] })),
        firstSubmitter: game.firstQuestionSubmitter
      });
    }
  });

  // Distribute questions so no one gets their own
  function distributeQuestions(roomCode) {
    try {
      const game = games[roomCode];
      console.log(`[distributeQuestions] Starting for room ${roomCode}`);
      
      if (!game) {
        console.error(`[distributeQuestions] ERROR: Game not found for room ${roomCode}`);
        return;
      }
      
      // CRITICAL FIX: Only use active players for question distribution
      const activePlayers = game.players.filter(p => p.isActive);
      console.log(`[distributeQuestions] Active players (${activePlayers.length}):`, activePlayers.map(p => ({ name: p.name, id: p.id })));
      console.log(`[distributeQuestions] Questions available:`, Object.keys(game.questions || {}));
      
      if (activePlayers.length === 0) {
        console.error(`[distributeQuestions] ERROR: No active players in room ${roomCode}`);
        return;
      }
      
      if (activePlayers.length < 3) {
        console.error(`[distributeQuestions] ERROR: Need at least 3 active players, have ${activePlayers.length}`);
        return;
      }
      
      // Only distribute to active players
      const playerIds = activePlayers.map(p => p.id);
      
      // Also filter questions to only include those from active players
      const activePlayerIds = new Set(playerIds);
      const availableQuestions = {};
      for (const [authorId, questionData] of Object.entries(game.questions || {})) {
        if (activePlayerIds.has(authorId)) {
          availableQuestions[authorId] = questionData;
        }
      }
      console.log(`[distributeQuestions] Questions from active players:`, Object.keys(availableQuestions));
      
      let shuffledIds = shuffleArray(playerIds);
      
      // Ensure no one gets their own question
      let attempts = 0;
      while (attempts < 100) {
        let valid = true;
        for (let i = 0; i < playerIds.length; i++) {
          if (playerIds[i] === shuffledIds[i]) {
            valid = false;
            break;
          }
        }
        if (valid) break;
        shuffledIds = shuffleArray(playerIds);
        attempts++;
      }
      
      console.log(`[distributeQuestions] Distribution attempts: ${attempts}`);
      
      // Assign questions to players
      game.questionAssignments = {};
      for (let i = 0; i < playerIds.length; i++) {
        const receiverId = playerIds[i];
        const questionAuthorId = shuffledIds[i];
        const questionData = availableQuestions[questionAuthorId];
        
        console.log(`[distributeQuestions] Assigning: ${activePlayers.find(p => p.id === receiverId)?.name || receiverId} gets question from ${activePlayers.find(p => p.id === questionAuthorId)?.name || questionAuthorId}`);
        
        if (!questionData) {
          console.error(`[distributeQuestions] ERROR: Missing question data for author ${questionAuthorId}`);
          continue;
        }
        
        if (!questionData.text || !questionData.authorName) {
          console.error(`[distributeQuestions] ERROR: Invalid question data for author ${questionAuthorId}:`, questionData);
          continue;
        }
        
        game.questionAssignments[receiverId] = questionData;
        console.log(`[distributeQuestions] Successfully assigned question to ${receiverId}`);
      }
      
      console.log(`[distributeQuestions] Assignments complete. Count: ${Object.keys(game.questionAssignments).length}`);
      
      game.phase = 'answering';
      console.log(`[distributeQuestions] Game phase set to 'answering'`);
      
      // Send each player their assigned question
      let sentCount = 0;
      for (const playerId of playerIds) {
        try {
          const assignedQuestion = game.questionAssignments[playerId];
          if (!assignedQuestion) {
            console.error(`[distributeQuestions] ERROR: No question assigned to player ${playerId}`);
            continue;
          }
          
          const playerName = activePlayers.find(p => p.id === playerId)?.name || 'Unknown';
          console.log(`[distributeQuestions] Sending to ${playerName} (${playerId})`);
          
          // Use socket.to(roomCode).emit instead of io.to(playerId) for reliability
          const playerSocket = io.sockets.sockets.get(playerId);
          if (playerSocket) {
            playerSocket.emit('answer-phase', {
              question: assignedQuestion.text,
              questionAuthor: assignedQuestion.authorName,
              lastQuestionSubmitter: game.lastQuestionSubmitter
            });
            console.log(`[distributeQuestions] Sent to ${playerName} successfully`);
            sentCount++;
          } else {
            console.error(`[distributeQuestions] ERROR: Socket not found for player ${playerId}`);
          }
        } catch (err) {
          console.error(`[distributeQuestions] ERROR sending to player ${playerId}:`, err.message);
        }
      }
      
      console.log(`[distributeQuestions] Complete. Sent to ${sentCount}/${playerIds.length} players`);

      // Reset progress so frontend shows 0/X when answering phase starts
      io.to(roomCode).emit('progress-update', {
        submitted: 0,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: false })),
        firstSubmitter: game.firstQuestionSubmitter,
        lastQuestionSubmitter: game.lastQuestionSubmitter
      });
    } catch (err) {
      console.error(`[distributeQuestions] CRITICAL ERROR:`, err.message);
      console.error(err.stack);
    }
  }

  // Player submits answer
  socket.on('submit-answer', (answer) => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
        console.log('submit-answer: using fallback roomCode from socket.rooms:', roomCode);
      }
    }
    const game = games[roomCode];

    if (!game || game.phase !== 'answering') {
      console.log(`Submit-answer rejected: game=${!!game}, phase=${game?.phase}`);
      return;
    }
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Submit-answer rejected: Player not found with socket ID ${socket.id}`);
      return;
    }
    
    const assignedQuestion = game.questionAssignments && game.questionAssignments[socket.id];
    
    console.log(`Answer submitted by ${player.name}:`, {
      playerId: socket.id,
      playerName: player.name,
      isActive: player.isActive,
      assignedQuestion: assignedQuestion?.text?.substring(0, 30) + '...',
      totalAnswersBefore: Object.keys(game.answers).length,
      allQuestionAssignments: Object.keys(game.questionAssignments || {})
    });
    
    if (!assignedQuestion) {
      console.log(`Submit-answer rejected: No assigned question for player ${player.name} with socket ${socket.id}`);
      socket.emit('error', 'No question assigned to you');
      return;
    }
    
    game.answers[socket.id] = {
      text: answer,
      question: assignedQuestion,
      authorId: socket.id,
      authorName: player.name || 'Unknown'
    };

    // Save answer to database
    const db = getDb();
    db.run("INSERT INTO answers (game_id, text, author_id, author_name, vote_count, anonymous) VALUES (?, ?, ?, ?, ?, ?)", 
      [game.dbGameId, answer, socket.id, player.name || 'Unknown', 0, game.currentRoundAnonymousMode ? 1 : 0]);
    const answerId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
    game.answers[socket.id].dbId = answerId;
    saveDatabase();

    // Track first submitter
    if (!game.firstAnswerSubmitter) {
      game.firstAnswerSubmitter = player.name || 'Unknown';
    }

    // Track last submitter (always update to latest)
    game.lastAnswerSubmitter = player.name || 'Unknown';

    socket.emit('answer-submitted');

    // Check if all ACTIVE players submitted answers
    const activePlayers = game.players.filter(p => p.isActive);
    const missingAnswers = activePlayers.filter(p => !game.answers[p.id]).map(p => ({ name: p.name, id: p.id }));
    console.log(`Answer check: ${activePlayers.length - missingAnswers.length}/${activePlayers.length} submitted (active players only)`);
    console.log('Active players:', activePlayers.map(p => ({ name: p.name, id: p.id, hasAnswer: !!game.answers[p.id] })));
    if (missingAnswers.length > 0) {
      console.log('Missing answers from:', missingAnswers);
    }

    const allSubmitted = missingAnswers.length === 0;
    if (allSubmitted) {
      console.log('All active players submitted! Starting performance phase...');
      preparePerformancePhase(roomCode);
    } else {
      io.to(roomCode).emit('progress-update', {
        submitted: Object.keys(game.answers).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: !!game.answers[p.id] })),
        firstSubmitter: game.firstAnswerSubmitter,
        lastQuestionSubmitter: game.lastQuestionSubmitter
      });
    }
  });

  // Build end-of-game summary with Q&A pairs
  function buildGameSummary(roomCode) {
    const game = games[roomCode];
    if (!game) return [];

    const isAnonymous = typeof game.currentRoundAnonymousMode === 'boolean' ? game.currentRoundAnonymousMode : game.anonymousMode;
    const db = getDb();

    if (game.turnLog && game.turnLog.length > 0) {
      const pairs = [];
      for (const turn of game.turnLog) {
        if (turn.isQuestionTurn) {
          const answerTurn = game.turnLog.find(t => t.turnIndex === turn.turnIndex + 1);
          const qAuthor = turn.questionAuthor || 'Unknown';
          const aAuthor = turn.actualAnswerAuthor || 'Unknown';
          const pAuthor = answerTurn?.pairedAnswerAuthor || 'Unknown';
          if (qAuthor === 'Unknown' || aAuthor === 'Unknown') {
            console.log(`[buildGameSummary] Missing name for turn ${turn.turnIndex}: qAuthor=${turn.questionAuthor} (id=${turn.questionAuthorId}), aAuthor=${turn.actualAnswerAuthor} (id=${turn.actualAnswerAuthorId})`);
          }

          // Find corresponding database IDs
          const questionData = Object.values(game.questions).find(q => q.text === turn.question);
          const answerData = Object.values(game.answers).find(a => a.text === turn.actualAnswer);
          const pairData = game.cardPairs?.find(p => p.question?.text === turn.question && p.answer?.text === turn.actualAnswer);

          // CRITICAL: The "game pairing" voted on is the performed/crossed combo shown to players:
          // turn.question + (answerTurn?.pairedAnswer)
          // We must ensure a qa_pairs row exists for (this Q, the paired A) so that:
          // - votes target a real persisted row
          // - vote_count updates affect best-of
          // - the exact "winning pair" (the one displayed as the game pairing) appears in best-of with correct authors
          // This makes performed pairings persist across replays/games.
          let pairDbId = pairData?.dbId || null;
          const pairedAText = answerTurn ? answerTurn.pairedAnswer : null;
          if (game.dbGameId && questionData?.dbId && pairedAText) {
            const pairedAData = Object.values(game.answers).find(a => a.text === pairedAText);
            const pairedAId = pairedAData?.dbId || null;
            if (pairedAId) {
              try {
                // Reuse existing row for this (game, q, a) combo if present (e.g. from prior round or original)
                let existing = db.exec(
                  "SELECT id FROM qa_pairs WHERE game_id = ? AND question_id = ? AND answer_id = ? LIMIT 1",
                  [game.dbGameId, questionData.dbId, pairedAId]
                );
                if (existing.length > 0 && existing[0].values.length > 0) {
                  pairDbId = existing[0].values[0][0];
                } else {
                  db.run(
                    "INSERT INTO qa_pairs (game_id, question_id, answer_id, vote_count, anonymous) VALUES (?, ?, ?, ?, ?)",
                    [game.dbGameId, questionData.dbId, pairedAId, 0, isAnonymous ? 1 : 0]
                  );
                  pairDbId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
                  saveDatabase();
                }
              } catch (e) {
                console.log('[buildGameSummary] ensure performed qa_pair failed:', e.message);
              }
            }
          }
          // Fallback to old lookup if we still don't have one
          if (!pairDbId) {
            if (pairData?.dbId) pairDbId = pairData.dbId;
            else if (game.dbGameId && turn.question && turn.actualAnswer) {
              try {
                const qRes = db.exec("SELECT id FROM questions WHERE game_id = ? AND text = ? LIMIT 1", [game.dbGameId, turn.question]);
                const aRes = db.exec("SELECT id FROM answers WHERE game_id = ? AND text = ? LIMIT 1", [game.dbGameId, turn.actualAnswer]);
                if (qRes.length > 0 && qRes[0].values.length > 0 && aRes.length > 0 && aRes[0].values.length > 0) {
                  const qid = qRes[0].values[0][0];
                  const aid = aRes[0].values[0][0];
                  const pRes = db.exec("SELECT id FROM qa_pairs WHERE game_id = ? AND question_id = ? AND answer_id = ? LIMIT 1", [game.dbGameId, qid, aid]);
                  if (pRes.length > 0 && pRes[0].values.length > 0) {
                    pairDbId = pRes[0].values[0][0];
                  }
                }
              } catch (e) {
                console.log('[buildGameSummary] DB lookup for pairDbId failed:', e.message);
              }
            }
          }

          pairs.push({
            question: turn.question || 'Unknown question',
            questionAuthorName: qAuthor,
            questionDbId: questionData?.dbId || null,
            actualAnswer: turn.actualAnswer || 'Unknown answer',
            actualAnswerAuthorName: aAuthor,
            actualAnswerDbId: answerData?.dbId || null,
            pairedAnswer: answerTurn ? answerTurn.pairedAnswer : null,
            pairedAnswerAuthorName: answerTurn ? pAuthor : null,
            pairDbId: pairDbId,
            anonymousMode: isAnonymous
          });
        }
      }
      console.log(`[buildGameSummary] Built ${pairs.length} pairs from turnLog`);
      return pairs;
    }

    // Fallback for older games without turnLog
    if (!game.cardPairs) return [];
    return game.cardPairs.map(pair => ({
      question: pair.question?.text || 'Unknown question',
      questionAuthorName: pair.question?.authorName || 'Unknown',
      questionDbId: pair.question?.dbId || null,
      actualAnswer: pair.answer?.text || 'Unknown answer',
      actualAnswerAuthorName: pair.answer?.authorName || 'Unknown',
      actualAnswerDbId: pair.answer?.dbId || null,
      pairedAnswer: null,
      pairedAnswerAuthorName: null,
      pairDbId: pair.dbId || null,
      anonymousMode: isAnonymous
    }));
  }

  // Prepare the performance/reading phase
  function preparePerformancePhase(roomCode) {
    const game = games[roomCode];
    
    // CRITICAL FIX: Only use active players for performance phase
    const activePlayers = game.players.filter(p => p.isActive);
    const playerIds = activePlayers.map(p => p.id);
    
    // Shuffle playerOrder for randomized reading order
    game.playerOrder = shuffleArray([...playerIds]);
    
    // Create cards: each card has the question they RECEIVED + their answer
    game.cardPairs = [];
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const answerData = game.answers[playerId];
      
      // Skip if no answer (shouldn't happen since we only enter performance after all submitted)
      if (!answerData) {
        console.error(`[preparePerformancePhase] No answer for player ${playerId}, skipping`);
        continue;
      }
      
      game.cardPairs.push({
        question: answerData.question, // The question they received
        answer: answerData,           // Their answer to that question
        playerId: playerId,
        playerName: answerData.authorName
      });
    }

    // Save Q&A pairs to database
    const db = getDb();
    for (const pair of game.cardPairs) {
      if (pair.question.dbId && pair.answer.dbId) {
        db.run("INSERT INTO qa_pairs (game_id, question_id, answer_id, vote_count, anonymous) VALUES (?, ?, ?, ?, ?)",
          [game.dbGameId, pair.question.dbId, pair.answer.dbId, 0, game.currentRoundAnonymousMode ? 1 : 0]);
        const pairId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
        pair.dbId = pairId;
      }
    }
    saveDatabase();
    
    // Shuffle the cards for final distribution — totally random, anyone can get any card
    game.shuffledCards = shuffleArray([...game.cardPairs]);
    
    let cardAssignments = {};
    let shuffledCardIndices = [];
    
    for (let i = 0; i < playerIds.length; i++) {
      shuffledCardIndices.push(i);
    }
    shuffledCardIndices = shuffleArray(shuffledCardIndices);
    
    // Assign cards with optional noSelfReading constraint
    if (game.noSelfReading) {
      console.log(`[preparePerformancePhase] No Self-Reading enabled - filtering self-authored cards`);
      for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        // Find a card that this player didn't author
        let assignedCard = null;
        let availableIndices = shuffledCardIndices.filter(idx => {
          const card = game.shuffledCards[idx];
          return card.question.authorId !== playerId && card.answer.authorId !== playerId;
        });
        
        if (availableIndices.length > 0) {
          // Pick a random available card
          const cardIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
          assignedCard = game.shuffledCards[cardIndex];
          // Remove this index from shuffledCardIndices so it's not reused
          shuffledCardIndices = shuffledCardIndices.filter(idx => idx !== cardIndex);
        } else {
          // Fallback: if no valid cards (rare edge case), assign any card
          console.warn(`[preparePerformancePhase] No valid cards for player ${playerId}, using fallback`);
          const cardIndex = shuffledCardIndices[0];
          assignedCard = game.shuffledCards[cardIndex];
          shuffledCardIndices = shuffledCardIndices.slice(1);
        }
        cardAssignments[playerId] = assignedCard;
      }
    } else {
      // Assign cards totally randomly — no restrictions
      for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        const cardIndex = shuffledCardIndices[i];
        cardAssignments[playerId] = game.shuffledCards[cardIndex];
      }
    }
    
    game.cardAssignments = cardAssignments;
    game.phase = 'performing';
    game.currentReaderIndex = 0;
    game.turnLog = [];
    
    io.to(roomCode).emit('performance-phase', {
      totalRounds: playerIds.length * 2,
      message: 'Get ready to read!'
    });
    
    // Start the chain
    setTimeout(() => {
      startNextReading(roomCode);
    }, 2000);
  }

  // Handle the reading chain - CORRECT LOOP: P1 reads Q → P2 reads A → P2 reads Q → P3 reads A...
  function startNextReading(roomCode) {
    const game = games[roomCode];
    // CRITICAL FIX: Use stable playerOrder set at start of performing phase, not current player list
    const playerIds = game.playerOrder || game.players.filter(p => p.isActive).map(p => p.id);
    const totalTurns = playerIds.length * 2;
    
    if (game.currentReaderIndex >= totalTurns) {
      const summary = buildGameSummary(roomCode);
      io.to(roomCode).emit('game-ended', {
        message: 'Thanks for playing!',
        summary: summary,
        firstQuestionSubmitter: game.firstQuestionSubmitter,
        firstAnswerSubmitter: game.firstAnswerSubmitter,
        lastQuestionSubmitter: game.lastQuestionSubmitter,
        lastAnswerSubmitter: game.lastAnswerSubmitter
      });
      game.phase = 'ended';
      return;
    }
    
    const isQuestionTurn = game.currentReaderIndex % 2 === 0;
    
    let questionReaderId, answerReaderId;
    
    if (isQuestionTurn) {
      // Even turns: player at index r/2 reads question, next player will answer
      const playerIndex = game.currentReaderIndex / 2;
      questionReaderId = playerIds[playerIndex];
      answerReaderId = playerIds[(playerIndex + 1) % playerIds.length];
    } else {
      // Odd turns: the "next player" from previous turn reads their answer
      const playerIndex = (game.currentReaderIndex + 1) / 2;
      answerReaderId = playerIds[playerIndex % playerIds.length];
      questionReaderId = playerIds[(playerIndex - 1 + playerIds.length) % playerIds.length];
    }
    
    // CRITICAL FIX: Skip turn if reader is currently disconnected
    const questionReaderPlayer = game.players.find(p => p.id === questionReaderId);
    const answerReaderPlayer = game.players.find(p => p.id === answerReaderId);
    const requiredReader = isQuestionTurn ? questionReaderPlayer : answerReaderPlayer;
    
    if (!requiredReader || !requiredReader.isActive) {
      console.log(`[startNextReading] Skipping turn ${game.currentReaderIndex} - reader is disconnected`);
      game.currentReaderIndex++;
      // Use setImmediate to avoid stack overflow if many turns need skipping
      setImmediate(() => startNextReading(roomCode));
      return;
    }
    
    const questionReaderName = questionReaderPlayer?.name || 'Unknown';
    const answerReaderName = answerReaderPlayer?.name || 'Unknown';
    
    const cardForQuestion = game.cardAssignments[questionReaderId];
    const cardForAnswer = game.cardAssignments[answerReaderId];
    
    if (!cardForQuestion || !cardForAnswer) {
      console.error(`[startNextReading] Missing card assignment for turn ${game.currentReaderIndex}`);
      game.currentReaderIndex++;
      setImmediate(() => startNextReading(roomCode));
      return;
    }
    
    const question = cardForQuestion.question.text;
    const answer = isQuestionTurn ? null : cardForAnswer.answer.text;
    
    const turnEntry = {
      turnIndex: game.currentReaderIndex,
      isQuestionTurn: isQuestionTurn,
      question: isQuestionTurn ? (cardForQuestion.question?.text || null) : null,
      questionAuthor: isQuestionTurn ? (cardForQuestion.question?.authorName || null) : null,
      questionAuthorId: isQuestionTurn ? (cardForQuestion.question?.authorId || null) : null,
      actualAnswer: isQuestionTurn ? (cardForQuestion.answer?.text || null) : null,
      actualAnswerAuthor: isQuestionTurn ? (cardForQuestion.answer?.authorName || null) : null,
      actualAnswerAuthorId: isQuestionTurn ? (cardForQuestion.answer?.authorId || null) : null,
      pairedAnswer: isQuestionTurn ? null : (cardForAnswer.answer?.text || null),
      pairedAnswerAuthor: isQuestionTurn ? null : (cardForAnswer.answer?.authorName || null),
      pairedAnswerAuthorId: isQuestionTurn ? null : (cardForAnswer.answer?.authorId || null)
    };
    game.turnLog.push(turnEntry);
    if (isQuestionTurn) {
      console.log(`[turnLog] Q-turn ${game.currentReaderIndex}: authorName=${turnEntry.questionAuthor}, answerAuthorName=${turnEntry.actualAnswerAuthor}`);
    }

    io.to(roomCode).emit('reading-turn', {
      questionReader: { id: questionReaderId, name: questionReaderName },
      answerReader: { id: answerReaderId, name: answerReaderName },
      question: question,
      answer: answer,
      questionDbId: isQuestionTurn ? cardForQuestion.question?.dbId : null,
      answerDbId: isQuestionTurn ? cardForQuestion.answer?.dbId : (cardForAnswer.answer?.dbId || null),
      round: game.currentReaderIndex + 1,
      total: totalTurns,
      isQuestionTurn: isQuestionTurn
    });
  }

  // Player confirms they finished reading
  socket.on('reading-complete', () => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    const game = games[roomCode];

    if (!game || game.phase !== 'performing') return;
    
    // CRITICAL FIX: Use stable playerOrder for reader validation
    const playerIds = game.playerOrder || game.players.filter(p => p.isActive).map(p => p.id);
    const isQuestionTurn = game.currentReaderIndex % 2 === 0;
    let expectedReaderId;
    
    if (isQuestionTurn) {
      const playerIndex = game.currentReaderIndex / 2;
      expectedReaderId = playerIds[playerIndex];
    } else {
      const playerIndex = (game.currentReaderIndex + 1) / 2;
      expectedReaderId = playerIds[playerIndex % playerIds.length];
    }
    
    if (socket.id !== expectedReaderId) {
      socket.emit('error', 'It\'s not your turn to advance');
      return;
    }
    
    game.currentReaderIndex++;
    startNextReading(roomCode);
  });

  // Player submits a vote (non-blocking during performance phase)
  socket.on('submit-vote', ({ type, targetId }) => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    console.log('submit-vote received:', { type, targetId, socketId: socket.id, roomCode })
    const game = games[roomCode];

    if (!game) {
      console.log('Vote rejected: game not found for roomCode:', roomCode)
      return
    }

    const db = getDb();

    // Resolve target table by vote type
    let tableName = null;
    if (type === 'question') tableName = 'questions';
    else if (type === 'answer') tableName = 'answers';
    else if (type === 'qa_pair') tableName = 'qa_pairs';
    else {
      socket.emit('vote-submitted', { success: false, message: 'Invalid vote type' });
      return;
    }

    // Toggle behavior: if already voted on this exact item, unvote it
    const existingVote = db.exec(
      "SELECT id FROM votes WHERE game_id = ? AND player_id = ? AND vote_type = ? AND target_id = ?",
      [game.dbGameId, socket.id, type, targetId]
    );
    if (existingVote.length > 0 && existingVote[0].values.length > 0) {
      const voteId = existingVote[0].values[0][0];
      db.run("DELETE FROM votes WHERE id = ?", [voteId]);
      db.run(`UPDATE ${tableName} SET vote_count = CASE WHEN vote_count > 0 THEN vote_count - 1 ELSE 0 END WHERE id = ?`, [targetId]);
      saveDatabase();
      const result = db.exec(`SELECT vote_count FROM ${tableName} WHERE id = ?`, [targetId]);
      const voteCount = result.length > 0 ? result[0].values[0][0] : 0;
      socket.emit('vote-submitted', { success: true, targetId, voteCount, isVoted: false });
      io.to(roomCode).emit('vote-update', { type, targetId, voteCount });
      return;
    }

    // Enforce single active vote per player for qa_pair across different targets
    if (type === 'qa_pair') {
      const otherVote = db.exec(
        "SELECT id FROM votes WHERE game_id = ? AND player_id = ? AND vote_type = ? LIMIT 1",
        [game.dbGameId, socket.id, type]
      );
      if (otherVote.length > 0 && otherVote[0].values.length > 0) {
        socket.emit('vote-submitted', { success: false, message: 'Already voted for another pairing. Click your vote to undo first.' });
        return;
      }
    }

    // Insert new vote and increment count
    db.run("INSERT INTO votes (game_id, player_id, vote_type, target_id) VALUES (?, ?, ?, ?)", [game.dbGameId, socket.id, type, targetId]);
    db.run(`UPDATE ${tableName} SET vote_count = vote_count + 1 WHERE id = ?`, [targetId]);
    saveDatabase();

    const result = db.exec(`SELECT vote_count FROM ${tableName} WHERE id = ?`, [targetId]);
    const voteCount = result.length > 0 ? result[0].values[0][0] : 0;
    socket.emit('vote-submitted', { success: true, targetId, voteCount, isVoted: true });
    io.to(roomCode).emit('vote-update', { type, targetId, voteCount });
    return;
  });

  // Host replays game with same players
  socket.on('replay-game', (payload = {}) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;

    // Honor No Self-Read choice made on the summary screen before replaying
    if (typeof payload.noSelfReading === 'boolean') {
      game.noSelfReading = payload.noSelfReading;
    }
    
    const totalPlayers = game.players.length;
    const activePlayers = game.players.filter(p => p.isActive);
    
    // If ANY player from the last game is missing, disband and send everyone to welcome
    if (activePlayers.length < totalPlayers || activePlayers.length < 3) {
      const missingNames = game.players.filter(p => !p.isActive).map(p => p.name);
      console.log(`[REPLAY] Cannot replay - missing players: ${missingNames.join(', ')} (${activePlayers.length}/${totalPlayers} active)`);
      
      // Notify all remaining players to return to welcome screen
      io.to(roomCode).emit('game-disbanded', {
        message: 'Not all players from the last game are present. Returning everyone to the new game screen.'
      });
      
      // Remove all players from the room and clean up
      for (const p of activePlayers) {
        const pSocket = io.sockets.sockets.get(p.id);
        if (pSocket) {
          pSocket.leave(roomCode);
          pSocket.roomCode = null;
        }
      }
      delete games[roomCode];
      console.log(`[REPLAY] Room ${roomCode} disbanded`);
      return;
    }
    
    // All players present - reset all game state
    // Preserve the lastQuestionSubmitter from the just-ended game so the "you were last" warning
    // carries over to the new writing phase (for the affected player, visible to all via badge + personal banner).
    const prevLastQuestionSubmitter = game.lastQuestionSubmitter;

    game.phase = 'writing';
    game.currentRoundAnonymousMode = game.anonymousMode;
    game.questions = {};
    game.answers = {};
    game.questionAssignments = {};
    game.cardPairs = [];
    game.shuffledCards = [];
    game.cardAssignments = {};
    game.currentReaderIndex = 0;
    game.playerOrder = [];
    game.firstQuestionSubmitter = null;
    game.firstAnswerSubmitter = null;
    game.lastQuestionSubmitter = prevLastQuestionSubmitter; // carry for the nudge
    game.lastAnswerSubmitter = null;

    // Clear the previous round's vote rows for this game so players aren't
    // blocked from voting again in the replayed round. The denormalized
    // vote_count totals on questions/answers/qa_pairs are preserved, so the
    // Best Of page still reflects all previously cast votes.
    try {
      const db = getDb();
      db.run("DELETE FROM votes WHERE game_id = ?", [game.dbGameId]);
      saveDatabase();
      console.log(`[REPLAY] Cleared previous votes for game ${game.dbGameId} in room ${roomCode}`);
    } catch (e) {
      console.error('[REPLAY] Failed to clear previous votes:', e.message);
    }
    
    // Notify all players to restart. Include lastQuestionSubmitter so non-host clients also get the indicator state + timer.
    io.to(roomCode).emit('game-restarted', { phase: 'writing', lastQuestionSubmitter: game.lastQuestionSubmitter });
    io.to(roomCode).emit('player-joined', { players: game.players.filter(p => p.isActive), hostId: game.host });
    console.log(`Game replayed in room ${roomCode}`);
  });

  // Host force-advances the game (skipping players who haven't submitted)
  socket.on('force-progress', () => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;

    if (game.phase === 'writing') {
      // Host must have submitted their question before force-advancing
      if (!game.questions[socket.id]) {
        socket.emit('error', 'You must submit your question before force-advancing');
        return;
      }
      const activePlayers = game.players.filter(p => p.isActive);
      // Remove players who haven't submitted from the active list
      const submitted = activePlayers.filter(p => game.questions[p.id]);
      if (submitted.length < 3) {
        socket.emit('error', 'Need at least 3 submissions to advance');
        return;
      }
      // Permanently remove non-submitters and notify them
      const toKick = activePlayers.filter(p => !game.questions[p.id]);
      for (const p of toKick) {
        console.log(`[FORCE-PROGRESS] Kicking non-submitter ${p.name} (${p.id}) from game`);
        const kickedSocket = io.sockets.sockets.get(p.id);
        if (kickedSocket) {
          kickedSocket.emit('kicked-from-game', { reason: 'You were removed for not submitting in time.' });
          kickedSocket.leave(roomCode);
          kickedSocket.roomCode = null;
        }
        removePlayerFromGame(roomCode, p.id);
      }
      distributeQuestions(roomCode);

    } else if (game.phase === 'answering') {
      // Host must have submitted their answer before force-advancing
      if (!game.answers[socket.id]) {
        socket.emit('error', 'You must submit your answer before force-advancing');
        return;
      }
      const activePlayers = game.players.filter(p => p.isActive);
      const submitted = activePlayers.filter(p => game.answers[p.id]);
      if (submitted.length < 2) {
        socket.emit('error', 'Need at least 2 answers to advance');
        return;
      }
      const toKick = activePlayers.filter(p => !game.answers[p.id]);
      for (const p of toKick) {
        console.log(`[FORCE-PROGRESS] Kicking non-answerer ${p.name} (${p.id}) from game`);
        const kickedSocket = io.sockets.sockets.get(p.id);
        if (kickedSocket) {
          kickedSocket.emit('kicked-from-game', { reason: 'You were removed for not answering in time.' });
          kickedSocket.leave(roomCode);
          kickedSocket.roomCode = null;
        }
        removePlayerFromGame(roomCode, p.id);
      }
      preparePerformancePhase(roomCode);

    } else if (game.phase === 'performing') {
      console.log(`[FORCE-PROGRESS] Host skipping turn ${game.currentReaderIndex} in performing phase`);
      game.currentReaderIndex++;
      startNextReading(roomCode);
    }
  });

  // Host immediately removes a disconnected/AFK player without waiting for grace
  socket.on('host-kick-player', ({ playerId }) => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (!playerId || playerId === socket.id) {
      socket.emit('error', "Can't kick yourself");
      return;
    }
    const target = game.players.find(p => p.id === playerId);
    if (!target) {
      socket.emit('error', 'Player not found');
      return;
    }
    console.log(`[HOST-KICK] Host kicking ${target.name} (${playerId}) from room ${roomCode}`);
    const kickedSocket = io.sockets.sockets.get(playerId);
    if (kickedSocket) {
      kickedSocket.emit('kicked-from-game', { reason: 'The host removed you from the game.' });
      kickedSocket.leave(roomCode);
      kickedSocket.roomCode = null;
    }
    removePlayerFromGame(roomCode, playerId);

    if (game.players.length === 0) {
      delete games[roomCode];
      return;
    }

    // Check if removal drops below phase minimum
    if (disbandIfBelowMinimum(roomCode)) return;

    const activePlayers = game.players.filter(p => p.isActive);
    io.to(roomCode).emit('player-left', { players: activePlayers, hostId: game.host });

    // Re-emit progress so any submission UIs update
    if (game.phase === 'writing') {
      io.to(roomCode).emit('progress-update', {
        submitted: activePlayers.filter(p => game.questions[p.id]).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!game.questions[p.id], isActive: true }))
      });
      // If all remaining have submitted, advance
      if (activePlayers.length >= 3 && activePlayers.every(p => game.questions[p.id])) {
        distributeQuestions(roomCode);
      }
    } else if (game.phase === 'answering') {
      io.to(roomCode).emit('progress-update', {
        submitted: activePlayers.filter(p => game.answers[p.id]).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!game.answers[p.id], isActive: true }))
      });
      if (activePlayers.length >= 2 && activePlayers.every(p => game.answers[p.id])) {
        preparePerformancePhase(roomCode);
      }
    } else if (game.phase === 'performing') {
      // If kicked player was the active reader, advance the turn
      const playerIds = game.playerOrder || activePlayers.map(p => p.id);
      const isQuestionTurn = game.currentReaderIndex % 2 === 0;
      let expectedReaderId;
      if (isQuestionTurn) {
        expectedReaderId = playerIds[game.currentReaderIndex / 2];
      } else {
        expectedReaderId = playerIds[((game.currentReaderIndex + 1) / 2) % playerIds.length];
      }
      if (expectedReaderId === playerId || expectedReaderId === null) {
        game.currentReaderIndex++;
        setTimeout(() => startNextReading(roomCode), 300);
      }
    }
  });

  // Host disbands room and sends everyone to welcome screen
  socket.on('disband-room', () => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;

    console.log(`[DISBAND] Host disbanding room ${roomCode}`);

    // Notify all players to return to welcome screen
    io.to(roomCode).emit('game-disbanded', {
      message: 'The host ended the game. Returning to the main screen.'
    });

    // Remove all players from the room and clean up
    for (const p of game.players) {
      const pSocket = io.sockets.sockets.get(p.id);
      if (pSocket) {
        pSocket.leave(roomCode);
        pSocket.roomCode = null;
      }
    }
    delete games[roomCode];
  });

  // Player leaves room voluntarily (Play Again)
  socket.on('leave-room', () => {
    let roomCode = socket.roomCode;
    // Fallback: try to get roomCode from socket.rooms if socket.roomCode is not set
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) {
        roomCode = gameRoom;
      }
    }
    if (roomCode && games[roomCode]) {
      const game = games[roomCode];
      const wasHost = game.host === socket.id;
      removePlayerFromGame(roomCode, socket.id);
      socket.leave(roomCode);
      socket.roomCode = null;

      if (game.players.length === 0) {
        delete games[roomCode];
        return;
      }
      // Transfer host if needed
      if (wasHost) {
        const hostChanged = ensureHost(roomCode);
        if (hostChanged) {
          const newHost = game.players.find(p => p.isHost);
          if (newHost) {
            io.to(roomCode).emit('host-changed', { hostId: newHost.id, hostName: newHost.name });
          }
        }
      }
      // If game phase has a minimum that's no longer met, disband
      if (disbandIfBelowMinimum(roomCode)) return;

      io.to(roomCode).emit('player-left', { players: game.players.filter(p => p.isActive), hostId: game.host });
    }
  });

  // Handle player reconnection within grace period
  socket.on('reconnect-player', ({ roomCode, playerName }) => {
    console.log(`[RECONNECT] Attempt: ${playerName} to room ${roomCode} (new socket: ${socket.id})`);
    
    const game = games[roomCode];
    
    if (!game) {
      console.log('[RECONNECT] Room not found:', roomCode);
      socket.emit('reconnect-failed', { reason: 'Room not found or expired', roomCode, playerName });
      return;
    }
    
    console.log('[RECONNECT] Room found, players:', game.players.map(p => ({ 
      name: p.name, id: p.id, isActive: p.isActive, disconnectedAt: p.disconnectedAt 
    })));
    
    // Step 1: Find the player by name (any state - active or not)
    const player = game.players.find(p => p.name === playerName);
    
    if (!player) {
      console.log(`[RECONNECT] No player named '${playerName}' in room ${roomCode}`);
      socket.emit('error', `Player '${playerName}' not found in room`);
      return;
    }
    
    // Step 2: If player is marked active, handle the stale/refresh case
    if (player.isActive) {
      const oldSocket = io.sockets.sockets.get(player.id);
      
      if (oldSocket && oldSocket.id === socket.id) {
        // Same socket trying to reconnect - player is already connected on THIS socket
        console.log(`[RECONNECT] Player ${playerName} already connected on this socket`);
        socket.emit('error', `You are already connected`);
        return;
      }
      
      if (oldSocket) {
        // Old socket is still alive in Socket.IO's map (browser refresh, disconnect not yet fired)
        // Remove the old socket from the room so it doesn't receive broadcasts
        // Do NOT call oldSocket.disconnect() as that triggers game logic in the disconnect handler
        console.log(`[RECONNECT] Removing stale socket ${player.id} from room ${roomCode}`);
        oldSocket.leave(roomCode);
        oldSocket.roomCode = null; // Prevent disconnect handler from finding game
      }
      
      // Mark player as disconnected so reconnection logic below works
      player.isActive = false;
      player.disconnectedAt = Date.now();
      console.log(`[RECONNECT] Marked stale player ${playerName} as disconnected for reconnection`);
    }
    
    // Step 3: Player should now be inactive - verify
    if (player.isActive) {
      console.log(`[RECONNECT] ERROR: Player ${playerName} is still active after cleanup`);
      socket.emit('error', 'Reconnection failed - player state error');
      return;
    }
    
    // Step 4: Check grace period
    const timeSinceDisconnect = Date.now() - player.disconnectedAt;
    console.log(`[RECONNECT] Time since disconnect: ${timeSinceDisconnect}ms`);
    
    if (timeSinceDisconnect > 90000) {
      game.players = game.players.filter(p => p.name !== playerName);
      socket.emit('reconnect-failed', { reason: 'Reconnection window expired (90 seconds)', roomCode, playerName });
      return;
    }
    
    // Step 5: Reactivate player
    clearTimeout(player.reconnectTimeout);
    
    // Save old ID and migrate all state to new socket ID
    const oldSocketId = player.id;
    player.id = socket.id;
    player.isActive = true;
    player.disconnectedAt = null;
    player.reconnectTimeout = null;
    
    // If this player was the host (check both player.isHost and game.host comparison), update game.host to new socket ID and player.isHost
    if (player.isHost || game.host === oldSocketId) {
      game.host = socket.id;
      player.isHost = true;
      console.log(`Updated game.host to new socket ID: ${socket.id} (was ${oldSocketId})`);
    }
    
    // CRITICAL FIX: Migrate ALL game state from old socket ID to new socket ID
    
    // 1. Migrate the question this player wrote
    if (game.questions[oldSocketId]) {
      game.questions[socket.id] = { ...game.questions[oldSocketId], authorId: socket.id };
      delete game.questions[oldSocketId];
      console.log(`Migrated question from ${oldSocketId} to ${socket.id}`);
    }
    
    // 2. Migrate question assignment (the question they need to answer)
    if (game.questionAssignments && game.questionAssignments[oldSocketId]) {
      game.questionAssignments[socket.id] = game.questionAssignments[oldSocketId];
      delete game.questionAssignments[oldSocketId];
      console.log(`Migrated question assignment from ${oldSocketId} to ${socket.id}`);
    }
    
    // 3. Migrate their answer
    if (game.answers[oldSocketId]) {
      game.answers[socket.id] = { ...game.answers[oldSocketId], authorId: socket.id };
      delete game.answers[oldSocketId];
      console.log(`Migrated answer from ${oldSocketId} to ${socket.id}`);
    }
    
    // 4. Migrate card assignments (performance phase)
    if (game.cardAssignments && game.cardAssignments[oldSocketId]) {
      game.cardAssignments[socket.id] = game.cardAssignments[oldSocketId];
      delete game.cardAssignments[oldSocketId];
      console.log(`Migrated card assignment from ${oldSocketId} to ${socket.id}`);
    }
    
    // 5. Update playerId references inside cardAssignments (a card may belong to this player as author)
    if (game.cardAssignments) {
      for (const cardKey of Object.keys(game.cardAssignments)) {
        const card = game.cardAssignments[cardKey];
        if (card.playerId === oldSocketId) {
          card.playerId = socket.id;
        }
        if (card.answer && card.answer.authorId === oldSocketId) {
          card.answer.authorId = socket.id;
        }
        if (card.question && card.question.authorId === oldSocketId) {
          card.question.authorId = socket.id;
        }
      }
    }
    
    // 6. Update playerOrder for stable performance phase indexing
    if (game.playerOrder) {
      const orderIndex = game.playerOrder.indexOf(oldSocketId);
      if (orderIndex !== -1) {
        game.playerOrder[orderIndex] = socket.id;
        console.log(`Updated playerOrder index ${orderIndex}: ${oldSocketId} -> ${socket.id}`);
      }
    }
    
    socket.join(roomCode);
    // Ensure socket.roomCode is set after joining the room
    socket.roomCode = roomCode;
    console.log(`Reconnection: socket joined room ${roomCode}, socket.id: ${socket.id}, socket.roomCode set to:`, socket.roomCode);
    
    // Build comprehensive reconnection state for frontend
    let assignedQuestion = null;
    if (game.phase === 'answering' && game.questionAssignments && game.questionAssignments[socket.id]) {
      assignedQuestion = game.questionAssignments[socket.id];
    }
    
    // Check if player already submitted in current phase
    const alreadySubmittedQuestion = game.phase === 'writing' && !!game.questions[socket.id];
    const alreadyAnswered = game.phase === 'answering' && !!game.answers[socket.id];
    
    // Calculate progress + statuses for current phase
    const activePlayers = game.players.filter(p => p.isActive);
    let progress = null;
    let playerStatuses = null;
    if (game.phase === 'writing') {
      const submitted = activePlayers.filter(p => game.questions[p.id]).length;
      progress = { submitted, total: activePlayers.length };
      playerStatuses = activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!game.questions[p.id], isActive: true }));
      progress.playerStatuses = playerStatuses;
    } else if (game.phase === 'answering') {
      const submitted = activePlayers.filter(p => game.answers[p.id]).length;
      progress = { submitted, total: activePlayers.length };
      playerStatuses = activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!game.answers[p.id], isActive: true }));
      progress.playerStatuses = playerStatuses;
    }

    // Notify player of successful reconnection with current game state
    const reconnectData = {
      success: true,
      phase: game.phase,
      players: activePlayers,
      isHost: player.isHost,
      hostId: game.host,
      roomCode: roomCode,
      assignedQuestion: assignedQuestion,
      alreadyAnswered: alreadyAnswered,
      alreadySubmittedQuestion: alreadySubmittedQuestion,
      progress: progress,
      anonymousMode: !!game.anonymousMode
    };

    // If reconnecting during ended phase, include the game summary
    if (game.phase === 'ended') {
      reconnectData.summary = buildGameSummary(roomCode);
    }

    // If reconnecting during performance phase, include current turn data
    if (game.phase === 'performing' && game.currentReaderIndex !== undefined && game.playerOrder) {
      const currentReaderId = game.playerOrder[game.currentReaderIndex];
      const isQuestionTurn = game.currentReaderIndex % 2 === 0;
      const questionReaderId = isQuestionTurn ? currentReaderId : game.playerOrder[game.currentReaderIndex - 1];
      const answerReaderId = isQuestionTurn ? game.playerOrder[game.currentReaderIndex + 1] : currentReaderId;

      // Find the question and answer for this turn
      let question = null;
      let pairedAnswer = null;
      let actualAnswer = null;

      if (game.cardAssignments) {
        for (const cardKey of Object.keys(game.cardAssignments)) {
          const card = game.cardAssignments[cardKey];
          if (card.playerId === questionReaderId) {
            question = card.question?.text;
            pairedAnswer = card.answer?.text;
            actualAnswer = card.actualAnswer?.text;
            break;
          }
        }
      }

      reconnectData.currentTurn = {
        isQuestionTurn,
        questionReader: { id: questionReaderId, name: game.players.find(p => p.id === questionReaderId)?.name || 'Unknown' },
        answerReader: { id: answerReaderId, name: game.players.find(p => p.id === answerReaderId)?.name || 'Unknown' },
        question,
        pairedAnswer,
        actualAnswer,
        round: game.currentRound || 1,
        total: game.totalRounds || 1
      };
    }

    socket.emit('reconnected', reconnectData);
    
    console.log(`[RECONNECT] Sent reconnected event to ${playerName} (phase=${game.phase})`);
    
    // Notify all players that this player has reconnected (updates player lists with correct isHost status)
    io.to(roomCode).emit('player-joined', { players: activePlayers, hostId: game.host });
    console.log(`[RECONNECT] Notified room ${roomCode} that ${playerName} reconnected`);
    
    // If reconnecting during performing phase, send current turn state
    if (game.phase === 'performing') {
      const playerIds = game.playerOrder || activePlayers.map(p => p.id);
      const totalTurns = playerIds.length * 2;
      const isQuestionTurn = game.currentReaderIndex % 2 === 0;
      
      let questionReaderId, answerReaderId;
      if (isQuestionTurn) {
        const playerIndex = game.currentReaderIndex / 2;
        questionReaderId = playerIds[playerIndex];
        answerReaderId = playerIds[(playerIndex + 1) % playerIds.length];
      } else {
        const playerIndex = (game.currentReaderIndex + 1) / 2;
        answerReaderId = playerIds[playerIndex % playerIds.length];
        questionReaderId = playerIds[(playerIndex - 1 + playerIds.length) % playerIds.length];
      }
      
      const cardForQuestion = game.cardAssignments && game.cardAssignments[questionReaderId];
      const cardForAnswer = game.cardAssignments && game.cardAssignments[answerReaderId];
      
      if (cardForQuestion && cardForAnswer) {
        socket.emit('reading-turn', {
          questionReader: { id: questionReaderId, name: game.players.find(p => p.id === questionReaderId)?.name || 'Unknown' },
          answerReader: { id: answerReaderId, name: game.players.find(p => p.id === answerReaderId)?.name || 'Unknown' },
          question: cardForQuestion.question.text,
          answer: isQuestionTurn ? null : cardForAnswer.answer.text,
          round: game.currentReaderIndex + 1,
          total: totalTurns,
          isQuestionTurn: isQuestionTurn
        });
      }
    }
    
    // Notify others that player rejoined
    io.to(roomCode).emit('player-rejoined', {
      players: activePlayers,
      playerName: playerName,
      hostId: game.host
    });

    // Broadcast a fresh progress-update so other clients refresh their
    // playerStatuses (the rejoined player's submitted state may differ).
    if (progress && playerStatuses) {
      io.to(roomCode).emit('progress-update', {
        submitted: progress.submitted,
        total: progress.total,
        playerStatuses: playerStatuses
      });
    }

    console.log(`[RECONNECT] ${playerName} reconnected to room ${roomCode} successfully`);
  });

  // Handle disconnect: lobby = immediate removal, in-game = 90s grace
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    const roomCode = socket.roomCode;
    if (!roomCode || !games[roomCode]) return;
    const game = games[roomCode];
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Disconnect - No player found with socket.id ${socket.id}`);
      return;
    }

    const wasHost = game.host === socket.id;

    // Lobby disconnect: remove immediately, no grace period.
    if (game.phase === 'lobby') {
      console.log(`Disconnect (lobby) - removing ${player.name} immediately`);
      removePlayerFromGame(roomCode, socket.id);
      if (game.players.length === 0) {
        delete games[roomCode];
        return;
      }
      if (wasHost) {
        const hostChanged = ensureHost(roomCode);
        if (hostChanged) {
          const newHost = game.players.find(p => p.isHost);
          if (newHost) {
            io.to(roomCode).emit('host-changed', { hostId: newHost.id, hostName: newHost.name });
          }
        }
      }
      io.to(roomCode).emit('player-left', game.players.filter(p => p.isActive));
      return;
    }

    // Ended phase: just remove silently (game is already over)
    if (game.phase === 'ended') {
      removePlayerFromGame(roomCode, socket.id);
      if (game.players.length === 0) delete games[roomCode];
      return;
    }

    // In-game disconnect: mark inactive and start grace period.
    console.log(`Disconnect (${game.phase}) - ${player.name} marked inactive, 90s grace`);
    player.isActive = false;
    player.disconnectedAt = Date.now();

    // Immediate host transfer if the host disconnected mid-game so host-only
    // controls (force-progress, replay, kick) remain usable.
    let hostTransferredTo = null;
    if (wasHost) {
      player.isHost = false;
      const hostChanged = ensureHost(roomCode);
      if (hostChanged) {
        const newHost = game.players.find(p => p.isHost);
        if (newHost) {
          hostTransferredTo = newHost;
          console.log(`[disconnect] Host transferred from ${player.name} to ${newHost.name}`);
        }
      }
    }

    io.to(roomCode).emit('player-disconnected', {
      players: game.players.filter(p => p.isActive),
      disconnectedPlayer: player.name,
      gracePeriod: 90
    });

    if (hostTransferredTo) {
      io.to(roomCode).emit('host-changed', { hostId: hostTransferredTo.id, hostName: hostTransferredTo.name });
    }

    // Defer game-state side effects briefly so a fast browser refresh can
    // call reconnect-player first and re-mark this player active. If the
    // player is active by the time this fires, skip the side effects.
    setTimeout(() => {
      const stillThere = games[roomCode];
      if (!stillThere) return;
      const stillPlayer = stillThere.players.find(p => p.id === socket.id);
      // If they reconnected (id changed) or are active again, skip side effects.
      if (!stillPlayer || stillPlayer.isActive) {
        console.log(`[disconnect-deferred] ${player.name} reconnected before grace - skipping side effects`);
        return;
      }

      // Writing phase: advance if remaining active players have all submitted
      if (stillThere.phase === 'writing') {
        const activePlayers = stillThere.players.filter(p => p.isActive);
        if (activePlayers.length >= 3 && activePlayers.every(p => stillThere.questions[p.id])) {
          console.log('All remaining active players submitted - distributing questions');
          distributeQuestions(roomCode);
        } else {
          io.to(roomCode).emit('progress-update', {
            submitted: Object.keys(stillThere.questions).filter(id => stillThere.players.find(p => p.id === id && p.isActive)).length,
            total: activePlayers.length,
            playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.questions[p.id], isActive: true }))
          });
        }
      }

      // Answering phase: same logic
      if (stillThere.phase === 'answering') {
        const activePlayers = stillThere.players.filter(p => p.isActive);
        if (activePlayers.length >= 2 && activePlayers.every(p => stillThere.answers[p.id])) {
          console.log('All remaining active players answered - moving to performance');
          preparePerformancePhase(roomCode);
        } else {
          io.to(roomCode).emit('progress-update', {
            submitted: Object.keys(stillThere.answers).filter(id => stillThere.players.find(p => p.id === id && p.isActive)).length,
            total: activePlayers.length,
            playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.answers[p.id], isActive: true }))
          });
        }
      }

      // Performing phase: skip turn if disconnected player was the active reader
      if (stillThere.phase === 'performing') {
        const playerIds = stillThere.playerOrder || stillThere.players.filter(p => p.isActive).map(p => p.id);
        const isQuestionTurn = stillThere.currentReaderIndex % 2 === 0;
        let expectedReaderId;
        if (isQuestionTurn) {
          expectedReaderId = playerIds[stillThere.currentReaderIndex / 2];
        } else {
          expectedReaderId = playerIds[((stillThere.currentReaderIndex + 1) / 2) % playerIds.length];
        }
        if (expectedReaderId === socket.id) {
          console.log(`Active reader ${player.name} disconnected - advancing turn`);
          stillThere.currentReaderIndex++;
          setTimeout(() => startNextReading(roomCode), 300);
        }

        // Disband if too few active players
        const activeCount = stillThere.players.filter(p => p.isActive).length;
        if (activeCount < 2) {
          disbandIfBelowMinimum(roomCode);
        }
      }
    }, 250);

    // Set 90-second grace timeout for permanent removal
    player.reconnectTimeout = setTimeout(() => {
      const stillThere = games[roomCode];
      if (!stillThere) return;
      const stillDisconnected = stillThere.players.find(p => p.id === socket.id && !p.isActive);
      if (!stillDisconnected) {
        console.log(`[grace-timeout] ${socket.id} no longer matches a disconnected player - skipping`);
        return;
      }
      console.log(`[grace-timeout] Permanently removing ${stillDisconnected.name}`);
      removePlayerFromGame(roomCode, socket.id);

      if (stillThere.players.length === 0) {
        delete games[roomCode];
        return;
      }

      // Disband if remaining active falls below phase minimum
      if (disbandIfBelowMinimum(roomCode)) return;

      io.to(roomCode).emit('player-left', { players: stillThere.players.filter(p => p.isActive), hostId: stillThere.host });

      // Re-emit progress so submission UIs refresh after permanent removal
      const activePlayers = stillThere.players.filter(p => p.isActive);
      if (stillThere.phase === 'writing') {
        io.to(roomCode).emit('progress-update', {
          submitted: activePlayers.filter(p => stillThere.questions[p.id]).length,
          total: activePlayers.length,
          playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.questions[p.id], isActive: true }))
        });
      } else if (stillThere.phase === 'answering') {
        io.to(roomCode).emit('progress-update', {
          submitted: activePlayers.filter(p => stillThere.answers[p.id]).length,
          total: activePlayers.length,
          playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.answers[p.id], isActive: true }))
        });
      }
    }, 90000);
  });
});

// Serve static frontend build (production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;

// Initialize database and start server
async function startServer() {
  await initDatabase();
  console.log('Database initialized');
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
