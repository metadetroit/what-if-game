const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS configuration for production
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'what-if-game', players: Object.values(games).reduce((acc, g) => acc + g.players.length, 0) });
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

function ensureHost(roomCode) {
  const game = games[roomCode];
  if (!game) return false;
  const activeHost = game.players.find(p => p.isHost && p.isActive);
  if (activeHost) {
    if (game.host !== activeHost.id) {
      game.host = activeHost.id;
      return true;
    }
    return false;
  }
  for (const p of game.players) p.isHost = false;
  const newHost = game.players.find(p => p.isActive);
  if (newHost) {
    newHost.isHost = true;
    game.host = newHost.id;
    return true;
  }
  return false;
}

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
      anonymousMode: false
    };
    games[roomCode] = game;
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    callback({ success: true, roomCode });
    console.log(`Room ${roomCode} created by ${playerName}`);
    
    // CRITICAL FIX: Emit player-joined to update host's player list
    io.to(roomCode).emit('player-joined', game.players.filter(p => p.isActive));
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
  socket.on('start-game', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;
    
    // CRITICAL FIX: Use active players count for minimum check
    const activePlayers = game.players.filter(p => p.isActive);
    if (activePlayers.length < 3) {
      socket.emit('error', 'Need at least 3 active players to start');
      return;
    }
    
    // CRITICAL FIX: Remove any disconnected players from lobby before starting
    game.players = activePlayers;
    game.phase = 'writing';
    io.to(roomCode).emit('game-started', { phase: 'writing' });
  });

  // Host toggles anonymous mode (show/hide names in end-of-game summary)
  socket.on('toggle-anonymous', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id || game.phase !== 'lobby') return;
    
    game.anonymousMode = !game.anonymousMode;
    // Only tell the host about the toggle state - other players don't know
    socket.emit('anonymous-toggled', { anonymousMode: game.anonymousMode });
    console.log(`Room ${roomCode}: Anonymous mode ${game.anonymousMode ? 'ON' : 'OFF'}`);
  });

  // Player submits question
  socket.on('submit-question', (question) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.phase !== 'writing') return;
    
    const player = game.players.find(p => p.id === socket.id);
    game.questions[socket.id] = {
      text: question,
      authorId: socket.id,
      authorName: player?.name || 'Unknown'
    };
    
    socket.emit('question-submitted');
    
    // CRITICAL FIX: Check if all ACTIVE players submitted (not including disconnected)
    const activePlayers = game.players.filter(p => p.isActive);
    const allSubmitted = activePlayers.every(p => game.questions[p.id]);
    console.log(`Question submission check: ${Object.keys(game.questions).length}/${activePlayers.length} active players submitted`);
    
    if (allSubmitted) {
      console.log('All active players submitted questions - distributing...');
      distributeQuestions(roomCode);
    } else {
      io.to(roomCode).emit('progress-update', {
        submitted: Object.keys(game.questions).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: !!game.questions[p.id] }))
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
              questionAuthor: assignedQuestion.authorName
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

      io.to(roomCode).emit('progress-update', {
        submitted: 0,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: false }))
      });
    } catch (err) {
      console.error(`[distributeQuestions] CRITICAL ERROR:`, err.message);
      console.error(err.stack);
    }
  }

  // Player submits answer
  socket.on('submit-answer', (answer) => {
    const roomCode = socket.roomCode;
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
        playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: !!game.answers[p.id] }))
      });
    }
  });

  function buildGameSummary(roomCode) {
    const game = games[roomCode];
    if (!game) return [];
    const isAnonymous = game.anonymousMode;
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
          pairs.push({
            question: turn.question || 'Unknown question',
            questionAuthorName: isAnonymous ? '???' : qAuthor,
            actualAnswer: turn.actualAnswer || 'Unknown answer',
            actualAnswerAuthorName: isAnonymous ? '???' : aAuthor,
            pairedAnswer: answerTurn ? answerTurn.pairedAnswer : null,
            pairedAnswerAuthorName: answerTurn ? (isAnonymous ? '???' : pAuthor) : null,
            anonymousMode: isAnonymous
          });
        }
      }
      console.log(`[buildGameSummary] Built ${pairs.length} pairs from turnLog`);
      return pairs;
    }
    if (!game.cardPairs) return [];
    return game.cardPairs.map(pair => ({
      question: pair.question?.text || 'Unknown question',
      questionAuthorName: isAnonymous ? '???' : (pair.question?.authorName || 'Unknown'),
      actualAnswer: pair.answer?.text || 'Unknown answer',
      actualAnswerAuthorName: isAnonymous ? '???' : (pair.answer?.authorName || 'Unknown'),
      pairedAnswer: null,
      pairedAnswerAuthorName: null,
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
    
    // Shuffle the cards for final distribution — totally random, anyone can get any card
    game.shuffledCards = shuffleArray([...game.cardPairs]);
    
    let cardAssignments = {};
    let shuffledCardIndices = [];
    
    for (let i = 0; i < playerIds.length; i++) {
      shuffledCardIndices.push(i);
    }
    shuffledCardIndices = shuffleArray(shuffledCardIndices);
    
    // Assign cards totally randomly — no restrictions
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const cardIndex = shuffledCardIndices[i];
      cardAssignments[playerId] = game.shuffledCards[cardIndex];
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
        summary: summary
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
      round: game.currentReaderIndex + 1,
      total: totalTurns,
      isQuestionTurn: isQuestionTurn
    });
  }

  // Player confirms they finished reading
  socket.on('reading-complete', () => {
    const roomCode = socket.roomCode;
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

  // Host replays game with same players
  socket.on('replay-game', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;
    
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
    game.phase = 'writing';
    game.questions = {};
    game.answers = {};
    game.questionAssignments = {};
    game.cardPairs = [];
    game.shuffledCards = [];
    game.cardAssignments = {};
    game.currentReaderIndex = 0;
    game.playerOrder = [];
    
    // Notify all players to restart
    io.to(roomCode).emit('game-restarted', { phase: 'writing' });
    io.to(roomCode).emit('player-joined', game.players.filter(p => p.isActive));
    console.log(`Game replayed in room ${roomCode}`);
  });

  // Host force-advances the game
  socket.on('force-progress', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;

    if (game.phase === 'writing') {
      const activePlayers = game.players.filter(p => p.isActive);
      const submitted = activePlayers.filter(p => game.questions[p.id]);
      if (submitted.length < 3) { socket.emit('error', 'Need at least 3 submissions to advance'); return; }
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
      const activePlayers = game.players.filter(p => p.isActive);
      const submitted = activePlayers.filter(p => game.answers[p.id]);
      if (submitted.length < 2) { socket.emit('error', 'Need at least 2 answers to advance'); return; }
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
    const roomCode = socket.roomCode;
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

    if (disbandIfBelowMinimum(roomCode)) return;

    const activePlayers = game.players.filter(p => p.isActive);
    io.to(roomCode).emit('player-left', activePlayers);

    if (game.phase === 'writing') {
      io.to(roomCode).emit('progress-update', {
        submitted: activePlayers.filter(p => game.questions[p.id]).length,
        total: activePlayers.length,
        playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!game.questions[p.id], isActive: true }))
      });
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

  // Player leaves room voluntarily (Play Again)
  socket.on('leave-room', () => {
    const roomCode = socket.roomCode;
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
      if (wasHost) {
        const hostChanged = ensureHost(roomCode);
        if (hostChanged) {
          const newHost = game.players.find(p => p.isHost);
          if (newHost) {
            io.to(roomCode).emit('host-changed', { hostId: newHost.id, hostName: newHost.name });
          }
        }
      }
      if (disbandIfBelowMinimum(roomCode)) return;

      io.to(roomCode).emit('player-left', game.players.filter(p => p.isActive));
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
    
    // If this player was the host, update game.host to new socket ID
    if (player.isHost) {
      game.host = socket.id;
      console.log(`Updated game.host to new socket ID: ${socket.id}`);
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
    socket.roomCode = roomCode;
    
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

    if (game.phase === 'ended') {
      reconnectData.summary = buildGameSummary(roomCode);
    }

    socket.emit('reconnected', reconnectData);
    
    console.log(`[RECONNECT] Sent reconnected event to ${playerName} (phase=${game.phase})`);
    
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
      playerName: playerName
    });

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

    if (game.phase === 'ended') {
      removePlayerFromGame(roomCode, socket.id);
      if (game.players.length === 0) delete games[roomCode];
      return;
    }

    console.log(`Disconnect (${game.phase}) - ${player.name} marked inactive, 90s grace`);
    player.isActive = false;
    player.disconnectedAt = Date.now();

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

    setTimeout(() => {
      const stillThere = games[roomCode];
      if (!stillThere) return;
      const stillPlayer = stillThere.players.find(p => p.id === socket.id);
      if (!stillPlayer || stillPlayer.isActive) {
        console.log(`[disconnect-deferred] ${player.name} reconnected before grace - skipping side effects`);
        return;
      }

      if (stillThere.phase === 'writing') {
        const activePlayers = stillThere.players.filter(p => p.isActive);
        if (activePlayers.length >= 3 && activePlayers.every(p => stillThere.questions[p.id])) {
          distributeQuestions(roomCode);
        } else {
          io.to(roomCode).emit('progress-update', {
            submitted: Object.keys(stillThere.questions).filter(id => stillThere.players.find(p => p.id === id && p.isActive)).length,
            total: activePlayers.length,
            playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.questions[p.id], isActive: true }))
          });
        }
      }

      if (stillThere.phase === 'answering') {
        const activePlayers = stillThere.players.filter(p => p.isActive);
        if (activePlayers.length >= 2 && activePlayers.every(p => stillThere.answers[p.id])) {
          preparePerformancePhase(roomCode);
        } else {
          io.to(roomCode).emit('progress-update', {
            submitted: Object.keys(stillThere.answers).filter(id => stillThere.players.find(p => p.id === id && p.isActive)).length,
            total: activePlayers.length,
            playerStatuses: activePlayers.map(p => ({ id: p.id, name: p.name, submitted: !!stillThere.answers[p.id], isActive: true }))
          });
        }
      }

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
          stillThere.currentReaderIndex++;
          setTimeout(() => startNextReading(roomCode), 300);
        }
        const activeCount = stillThere.players.filter(p => p.isActive).length;
        if (activeCount < 2) {
          disbandIfBelowMinimum(roomCode);
        }
      }
    }, 250);

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

      if (disbandIfBelowMinimum(roomCode)) return;

      io.to(roomCode).emit('player-left', stillThere.players.filter(p => p.isActive));

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

// Serve static files from the React build directory (for production)
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
