const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// CORS configuration for production
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Health check endpoint for Render.com
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'what-if-game-backend', players: Object.values(games).reduce((acc, g) => acc + g.players.length, 0) });
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
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new game room
  socket.on('create-room', (playerName, callback) => {
    const roomCode = generateRoomCode();
    
    games[roomCode] = {
      host: socket.id,
      players: [{ id: socket.id, name: playerName, isHost: true }],
      phase: 'lobby',
      questions: {},
      answers: {},
      currentReaderIndex: 0,
      playerOrder: []
    };
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    callback({ success: true, roomCode });
    console.log(`Room ${roomCode} created by ${playerName}`);
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
    
    game.players.push({ id: socket.id, name: playerName, isHost: false });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    callback({ success: true });
    
    // Notify all players in room
    io.to(roomCode).emit('player-joined', game.players);
    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Host starts the game
  socket.on('start-game', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;
    if (game.players.length < 3) {
      socket.emit('error', 'Need at least 3 players to start');
      return;
    }
    
    game.phase = 'writing';
    io.to(roomCode).emit('game-started', { phase: 'writing' });
  });

  // Player submits question
  socket.on('submit-question', (question) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.phase !== 'writing') return;
    
    game.questions[socket.id] = {
      text: question,
      authorId: socket.id,
      authorName: game.players.find(p => p.id === socket.id)?.name
    };
    
    socket.emit('question-submitted');
    
    // Check if all players submitted
    const allSubmitted = game.players.every(p => game.questions[p.id]);
    if (allSubmitted) {
      // Shuffle and distribute questions (no one gets their own)
      distributeQuestions(roomCode);
    } else {
      io.to(roomCode).emit('progress-update', {
        submitted: Object.keys(game.questions).length,
        total: game.players.length
      });
    }
  });

  // Distribute questions so no one gets their own
  function distributeQuestions(roomCode) {
    const game = games[roomCode];
    const playerIds = game.players.map(p => p.id);
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
    
    // Assign questions to players
    game.questionAssignments = {};
    for (let i = 0; i < playerIds.length; i++) {
      const receiverId = playerIds[i];
      const questionAuthorId = shuffledIds[i];
      game.questionAssignments[receiverId] = game.questions[questionAuthorId];
    }
    
    game.phase = 'answering';
    
    // Send each player their assigned question
    for (const playerId of playerIds) {
      const assignedQuestion = game.questionAssignments[playerId];
      io.to(playerId).emit('answer-phase', {
        question: assignedQuestion.text,
        questionAuthor: assignedQuestion.authorName
      });
    }
  }

  // Player submits answer
  socket.on('submit-answer', (answer) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.phase !== 'answering') return;
    
    const assignedQuestion = game.questionAssignments[socket.id];
    game.answers[socket.id] = {
      text: answer,
      question: assignedQuestion,
      authorId: socket.id,
      authorName: game.players.find(p => p.id === socket.id)?.name
    };
    
    socket.emit('answer-submitted');
    
    // Check if all players submitted answers
    const allSubmitted = game.players.every(p => game.answers[p.id]);
    if (allSubmitted) {
      preparePerformancePhase(roomCode);
    } else {
      io.to(roomCode).emit('progress-update', {
        submitted: Object.keys(game.answers).length,
        total: game.players.length
      });
    }
  });

  // Prepare the performance/reading phase
  function preparePerformancePhase(roomCode) {
    const game = games[roomCode];
    const playerIds = game.players.map(p => p.id);
    
    // Create cards: each card has the question they RECEIVED + their answer
    game.cardPairs = [];
    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const answerData = game.answers[playerId];
      
      game.cardPairs.push({
        question: answerData.question, // The question they received
        answer: answerData,           // Their answer to that question
        playerId: playerId,
        playerName: answerData.authorName
      });
    }
    
    // Shuffle the cards for final distribution
    game.shuffledCards = shuffleArray([...game.cardPairs]);
    
    // Distribute cards so no one gets their own
    let cardAssignments = {};
    let attempts = 0;
    
    while (attempts < 100) {
      let valid = true;
      let shuffledCardIndices = [];
      
      for (let i = 0; i < playerIds.length; i++) {
        shuffledCardIndices.push(i);
      }
      shuffledCardIndices = shuffleArray(shuffledCardIndices);
      
      // Check if anyone gets their own card
      for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i];
        const cardIndex = shuffledCardIndices[i];
        const card = game.shuffledCards[cardIndex];
        
        if (card.playerId === playerId) {
          valid = false;
          break;
        }
      }
      
      if (valid) {
        // Assignment is valid
        for (let i = 0; i < playerIds.length; i++) {
          const playerId = playerIds[i];
          const cardIndex = shuffledCardIndices[i];
          cardAssignments[playerId] = game.shuffledCards[cardIndex];
        }
        break;
      }
      
      attempts++;
    }
    
    game.cardAssignments = cardAssignments;
    game.phase = 'performing';
    game.currentReaderIndex = 0;
    
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
    const playerIds = game.players.map(p => p.id);
    const totalTurns = playerIds.length * 2;
    
    if (game.currentReaderIndex >= totalTurns) {
      io.to(roomCode).emit('game-ended', { message: 'Thanks for playing!' });
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
    
    const questionReaderName = game.players.find(p => p.id === questionReaderId)?.name || 'Unknown';
    const answerReaderName = game.players.find(p => p.id === answerReaderId)?.name || 'Unknown';
    
    const question = game.cardAssignments[questionReaderId].question.text;
    const answer = isQuestionTurn ? null : game.cardAssignments[answerReaderId].answer.text;
    
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
    
    // Validate: only the current reader can advance the turn
    const playerIds = game.players.map(p => p.id);
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
    
    // Reset game state but keep players and room
    game.phase = 'writing';
    game.questions = {};
    game.answers = {};
    game.questionAssignments = {};
    game.cardPairs = [];
    game.shuffledCards = [];
    game.cardAssignments = {};
    game.currentReaderIndex = 0;
    
    // Notify all players to restart
    io.to(roomCode).emit('game-restarted', { phase: 'writing' });
    console.log(`Game replayed in room ${roomCode}`);
  });

  // Player leaves room voluntarily (Play Again)
  socket.on('leave-room', () => {
    const roomCode = socket.roomCode;
    if (roomCode && games[roomCode]) {
      const game = games[roomCode];
      game.players = game.players.filter(p => p.id !== socket.id);
      socket.leave(roomCode);
      socket.roomCode = null;
      
      if (game.players.length === 0) {
        delete games[roomCode];
      } else {
        // Transfer host if needed
        if (game.host === socket.id) {
          game.host = game.players[0].id;
          game.players[0].isHost = true;
        }
        io.to(roomCode).emit('player-left', game.players);
      }
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const roomCode = socket.roomCode;
    if (roomCode && games[roomCode]) {
      const game = games[roomCode];
      const wasHost = game.host === socket.id;
      const wasInGame = game.players.some(p => p.id === socket.id);
      game.players = game.players.filter(p => p.id !== socket.id);
      
      if (game.players.length === 0) {
        delete games[roomCode];
        return;
      }
      
      // Transfer host role if host disconnected
      if (wasHost) {
        game.host = game.players[0].id;
        game.players[0].isHost = true;
      }
      
      io.to(roomCode).emit('player-left', game.players);
      
      // If in performing phase and the disconnected player was the current reader, skip their turn
      if (wasInGame && game.phase === 'performing') {
        const playerIds = game.players.map(p => p.id);
        const isQuestionTurn = game.currentReaderIndex % 2 === 0;
        let expectedReaderId;
        
        if (isQuestionTurn) {
          const playerIndex = game.currentReaderIndex / 2;
          expectedReaderId = playerIds[playerIndex];
        } else {
          const playerIndex = (game.currentReaderIndex + 1) / 2;
          expectedReaderId = playerIds[playerIndex % playerIds.length];
        }
        
        if (socket.id === expectedReaderId) {
          // Skip this turn since the reader is gone
          game.currentReaderIndex++;
          setTimeout(() => startNextReading(roomCode), 500);
        }
      }
      
      // If too few players remain during performing, end the game
      if (game.phase === 'performing' && game.players.length < 2) {
        io.to(roomCode).emit('game-ended', { message: 'Not enough players remaining' });
        game.phase = 'ended';
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
