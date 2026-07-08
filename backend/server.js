const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase, getDb, saveDatabase } = require('./database');
const { calculateRoundPoints, tallyRound, mergeRoundScores, resolveStandings } = require('./tournament');

const ADMIN_KEY = 'fluke-admin-2024';

const app = express();

// CORS configuration for production
const corsOrigin = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// --- Rate limiting ---
// General API limiter: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' }
});
app.use('/api/', apiLimiter);

// Stricter limiter for write operations: 10 per minute per IP
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' }
});
app.use('/api/hide-game', writeLimiter);
app.use('/api/delete-best-of', writeLimiter);

// Health check endpoint for Render.com
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'what-if-game-backend', players: Object.values(games).reduce((acc, g) => acc + g.players.length, 0) });
});

// API: Get best of content
app.get('/api/best-of', async (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 50);
  const type = req.query.type; // 'questions', 'answers', 'qa_pairs', or undefined for all
  const sort = (req.query.sort || 'votes').toLowerCase(); // 'votes' | 'newest'
  const offset = parseInt(req.query.offset) || 0;
  const pairVoteThreshold = sort === 'newest' ? 1 : 2;

  let results = [];

  try {
    if (!type || type === 'questions') {
      const orderByQuestions = sort === 'newest' ? 'g.created_at DESC' : 'q.vote_count DESC';
      const questions = await db.exec(`
        SELECT q.id, q.text, q.author_name, q.vote_count, g.created_at, q.anonymous
        FROM questions q
        JOIN games g ON q.game_id = g.id
        WHERE g.hidden_from_best_of = 0 AND q.vote_count >= 1 AND (q.hidden IS NULL OR q.hidden = 0)
        ORDER BY ${orderByQuestions}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      if (questions.length > 0) {
        questions[0].values.forEach(row => {
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
      const answers = await db.exec(`
        SELECT a.id, a.text, a.author_name, a.vote_count, g.created_at, a.anonymous
        FROM answers a
        JOIN games g ON a.game_id = g.id
        WHERE g.hidden_from_best_of = 0 AND a.vote_count >= 1 AND (a.hidden IS NULL OR a.hidden = 0)
        ORDER BY ${orderByAnswers}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      if (answers.length > 0) {
        answers[0].values.forEach(row => {
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
      const pairs = await db.exec(`
        SELECT qp.id, q.text as question_text, a.text as answer_text,
               q.author_name as question_author, a.author_name as answer_author,
               qp.vote_count, g.created_at, qp.anonymous
        FROM qa_pairs qp
        JOIN questions q ON qp.question_id = q.id
        JOIN answers a ON qp.answer_id = a.id
        JOIN games g ON qp.game_id = g.id
        WHERE g.hidden_from_best_of = 0 AND qp.vote_count >= 1
              AND (qp.hidden IS NULL OR qp.hidden = 0)
              AND qp.is_approved = 1
              AND (qp.is_nsfw IS NULL OR qp.is_nsfw = 0)
        ORDER BY ${orderByPairs}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      if (pairs.length > 0) {
        pairs[0].values.forEach(row => {
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

    if (!type) {
      results.sort((a, b) => b.vote_count - a.vote_count);
      results = results.slice(0, limit);
    }
  } catch (e) {
    console.error('[best-of] Error:', e.message);
  }

  res.json(results);
});

// Uncut Best Of endpoint - returns all approved content (SFW + NSFW)
app.get('/api/best-of-uncut', async (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 50);
  const type = req.query.type; // 'questions', 'answers', 'qa_pairs', or undefined for all
  const sort = (req.query.sort || 'votes').toLowerCase(); // 'votes' | 'newest'
  const offset = parseInt(req.query.offset) || 0;
  const pairVoteThreshold = sort === 'newest' ? 1 : 2;

  let results = [];

  try {
    if (!type || type === 'qa_pairs') {
      const orderByPairs = sort === 'newest' ? 'g.created_at DESC' : 'qp.vote_count DESC';
      const pairs = await db.exec(`
        SELECT qp.id, q.text as question_text, a.text as answer_text,
               q.author_name as question_author, a.author_name as answer_author,
               qp.vote_count, g.created_at, qp.anonymous, qp.is_nsfw
        FROM qa_pairs qp
        JOIN questions q ON qp.question_id = q.id
        JOIN answers a ON qp.answer_id = a.id
        JOIN games g ON qp.game_id = g.id
        WHERE g.hidden_from_best_of = 0 AND qp.vote_count >= 1
              AND (qp.hidden IS NULL OR qp.hidden = 0)
              AND qp.is_approved = 1
        ORDER BY ${orderByPairs}
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      if (pairs.length > 0) {
        pairs[0].values.forEach(row => {
          const isAnon = row[7] === 1 || row[7] === true;
          results.push({
            type: 'qa_pair',
            id: row[0],
            question: row[1],
            answer: row[2],
            question_author: isAnon ? '???' : (row[3] || 'Unknown'),
            answer_author: isAnon ? '???' : (row[4] || 'Unknown'),
            vote_count: row[5],
            game_date: row[6],
            is_nsfw: row[8] === 1 || row[8] === true
          });
        });
      }
    }

    if (!type) {
      results.sort((a, b) => b.vote_count - a.vote_count);
      results = results.slice(0, limit);
    }
  } catch (e) {
    console.error('[best-of-uncut] Error:', e.message);
  }

  res.json(results);
});

// API: Hide game from best of page (admin only)
app.post('/api/hide-game', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { roomCode } = req.body;
  
  if (!roomCode) {
    return res.status(400).json({ success: false, error: 'roomCode required' });
  }

  const db = getDb();
  await db.run("UPDATE games SET hidden_from_best_of = 1 WHERE room_code = ?", [roomCode]);
  
  res.json({ success: true });
});

// API: Delete/hide a best-of item (admin only)
app.post('/api/delete-best-of', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { type, id } = req.body;
  
  if (!type || !id) {
    return res.status(400).json({ success: false, error: 'type and id required' });
  }

  const db = getDb();
  let tableName = null;
  if (type === 'question') tableName = 'questions';
  else if (type === 'answer') tableName = 'answers';
  else if (type === 'qa_pair') tableName = 'qa_pairs';
  else {
    return res.status(400).json({ success: false, error: 'Invalid type' });
  }

  try {
    await db.run(`UPDATE ${tableName} SET hidden = 1 WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[delete-best-of] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Approve pair as SFW (admin only)
app.post('/api/admin/approve-sfw', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'id required' });
  }

  const db = getDb();
  try {
    await db.run("UPDATE qa_pairs SET is_approved = 1, is_nsfw = 0 WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[approve-sfw] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Approve pair as NSFW (admin only)
app.post('/api/admin/approve-nsfw', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'id required' });
  }

  const db = getDb();
  try {
    await db.run("UPDATE qa_pairs SET is_approved = 1, is_nsfw = 1 WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[approve-nsfw] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Delete pair permanently (admin only)
app.delete('/api/admin/delete-pair', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'id required' });
  }

  const db = getDb();
  try {
    await db.run("DELETE FROM qa_pairs WHERE id = ?", [id]);
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[delete-pair] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/admin/reject-factual', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, error: 'id required' });
  }

  const db = getDb();
  try {
    await db.run("UPDATE qa_pairs SET hidden = 1 WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (e) {
    console.error('[reject-factual] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Get pending pairs for moderation (admin only)
app.get('/api/admin/pending', async (req, res) => {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) {
    return res.status(403).json({ success: false, error: 'Admin key required' });
  }
  const db = getDb();
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  try {
    const pairs = await db.exec(`
      SELECT qp.id, q.text as question_text, a.text as answer_text,
             q.author_name as question_author, a.author_name as answer_author,
             qp.vote_count, g.created_at, qp.anonymous
      FROM qa_pairs qp
      JOIN questions q ON qp.question_id = q.id
      JOIN answers a ON qp.answer_id = a.id
      JOIN games g ON qp.game_id = g.id
      WHERE qp.is_approved = 0
            AND qp.vote_count >= 1
            AND (qp.hidden IS NULL OR qp.hidden = 0)
            AND (q.hidden IS NULL OR q.hidden = 0)
            AND (a.hidden IS NULL OR a.hidden = 0)
            AND q.text IS NOT NULL AND TRIM(q.text) <> ''
            AND a.text IS NOT NULL AND TRIM(a.text) <> ''
            AND LENGTH(TRIM(q.text)) >= 10
      ORDER BY g.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const results = [];
    if (pairs.length > 0 && pairs[0].values.length > 0) {
      pairs[0].values.forEach(row => {
        const isAnon = row[6] === 1 || row[6] === true;
        results.push({
          type: 'qa_pair',
          id: row[0],
          question: row[1],
          answer: row[2],
          question_author: isAnon ? '???' : (row[3] || 'Unknown'),
          answer_author: isAnon ? '???' : (row[4] || 'Unknown'),
          vote_count: row[5],
          game_date: row[7]
        });
      });
    }

    res.json(results);
  } catch (e) {
    console.error('[pending] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// API: Get random best-of pairs for front page examples and Fluke It button
app.get('/api/random-pairs', async (req, res) => {
  const db = getDb();
  const count = parseInt(req.query.count) || 6;
  try {
    const pairs = await db.exec(`
      SELECT qp.id, q.text as question_text, a.text as answer_text,
             q.author_name as question_author, a.author_name as answer_author,
             qp.vote_count, qp.anonymous
      FROM qa_pairs qp
      JOIN questions q ON qp.question_id = q.id
      JOIN answers a ON qp.answer_id = a.id
      JOIN games g ON qp.game_id = g.id
      WHERE g.hidden_from_best_of = 0 AND qp.vote_count >= 1
            AND (qp.hidden IS NULL OR qp.hidden = 0)
            AND (q.hidden IS NULL OR q.hidden = 0)
            AND (a.hidden IS NULL OR a.hidden = 0)
            AND qp.is_approved = 1
            AND (qp.is_nsfw IS NULL OR qp.is_nsfw = 0)
      ORDER BY RANDOM()
      LIMIT ?
    `, [count]);
    
    const results = [];
    if (pairs.length > 0 && pairs[0].values.length > 0) {
      pairs[0].values.forEach(row => {
        const isAnon = row[6] === 1 || row[6] === true;
        results.push({
          type: 'qa_pair',
          id: row[0],
          question: row[1],
          answer: row[2],
          question_author: isAnon ? '???' : (row[3] || 'Unknown'),
          answer_author: isAnon ? '???' : (row[4] || 'Unknown'),
          vote_count: row[5]
        });
      });
    }
    res.json(results);
  } catch (e) {
    console.error('[random-pairs] Error:', e.message);
    res.json([]);
  }
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
  },
  pingTimeout: 120000,
  pingInterval: 25000
});

// Store games in memory (use Redis for production)
const games = {};

// Ring buffer of recently-used room codes to avoid immediate reuse
const recentRoomCodes = new Set();
const MAX_RECENT_CODES = 100;

// Vote rate limiter: min ms between votes per socket
const lastVoteTime = new Map();
const VOTE_RATE_LIMIT_MS = 500;

// Connection rate limiter: 3s cooldown per IP on create-room / join-room
const connectionRateLimits = new Map();
const CONNECTION_COOLDOWN_MS = 3000;

function generateRoomCode() {
  const existingCodes = new Set(Object.keys(games));
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    if (!existingCodes.has(code) && !recentRoomCodes.has(code)) {
      recentRoomCodes.add(code);
      if (recentRoomCodes.size > MAX_RECENT_CODES) {
        const first = recentRoomCodes.values().next().value;
        recentRoomCodes.delete(first);
      }
      return code;
    }
  }
  // Extremely unlikely — just timestamp-based 4-digit suffix
  return Date.now().toString().slice(-4);
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
    // Keep original host as host - they can reconnect within 180s
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

// --- Socket.IO rate limiting ---
// Only the high-frequency, spammable 'reaction' event is throttled. Critical
// lifecycle/gameplay events (reconnect-player, check-presence, reading-complete,
// submit-vote, etc.) are NEVER blocked so reconnection and game flow can't break.
// Excess reactions are silently dropped (no error emitted to the client).
const reactionRateMap = new Map(); // socketId -> { count, resetTime }
const REACTION_RATE_WINDOW = 10 * 1000; // 10 seconds
const REACTION_RATE_MAX = 20; // 20 reactions per 10s per socket

function checkReactionRate(socketId) {
  const now = Date.now();
  let entry = reactionRateMap.get(socketId);
  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + REACTION_RATE_WINDOW };
    reactionRateMap.set(socketId, entry);
    return true;
  }
  entry.count++;
  return entry.count <= REACTION_RATE_MAX;
}

// Cleanup rate map on disconnect
function clearSocketRate(socketId) {
  reactionRateMap.delete(socketId);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Throttle ONLY the 'reaction' event; silently drop excess. All other events pass through.
  socket.use((packet, next) => {
    const eventName = Array.isArray(packet) ? packet[0] : null;
    if (eventName === 'reaction' && !checkReactionRate(socket.id)) {
      return; // drop excess reaction silently — do not call next(), do not error
    }
    next();
  });
  
  // NOTE: Stale connection cleanup happens implicitly via the reconnect-player handler
  // which checks if the 'active' socket is actually dead before rejecting the reconnect.

  // Create new game room
  socket.on('create-room', async (playerName, callback) => {
    // Connection rate limit: 3s cooldown per IP
    const clientIp = socket.handshake.address || socket.id;
    const nowConn = Date.now();
    const lastConn = connectionRateLimits.get(clientIp) || 0;
    if (nowConn - lastConn < CONNECTION_COOLDOWN_MS) {
      callback({ success: false, error: 'Please wait before trying to create or join a room again' });
      return;
    }
    connectionRateLimits.set(clientIp, nowConn);

    if (typeof playerName !== 'string' || !playerName.trim()) {
      callback({ success: false, error: 'Name cannot be empty' });
      return;
    }
    const cleanName = playerName.trim().substring(0, 20);
    const roomCode = generateRoomCode();
    
    const game = {
      host: socket.id,
      players: [{ id: socket.id, name: cleanName, isHost: true, isActive: true, role: 'player', hasSubmittedQuestion: false, hasSubmittedAnswer: false }],
      phase: 'lobby',
      questions: {},
      answers: {},
      currentReaderIndex: 0,
      playerOrder: [],
      anonymousMode: false,
      currentRoundAnonymousMode: false,
      noSelfReading: false,
      reactions: {},      // { contentId: { emoji: count, ... } }
      playerReactions: {}, // { contentId: Set(playerId) }
      tournament: null,   // Set when host starts a tournament game
      voteWriteQueue: Promise.resolve() // Serializes vote DB writes for atomic tallying
    };
    games[roomCode] = game;
    
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    // Save game to database
    const db = getDb();
    await db.run("INSERT INTO games (room_code, anonymous_mode, hidden_from_best_of) VALUES (?, ?, ?)", [roomCode, 0, 0]);
    const gameIdResult = await db.exec("SELECT last_insert_rowid() as id");
    const gameId = gameIdResult[0].values[0][0];
    game.dbGameId = gameId;
    
    callback({ success: true, roomCode });
    console.log(`Room ${roomCode} created by ${cleanName}`);

    // CRITICAL FIX: Emit player-joined to update host's player list
    const activePlayers = game.players.filter(p => p.isActive);
    io.to(roomCode).emit('player-joined', { players: activePlayers, hostId: game.host });

    // Send initial lobby settings to the host
    broadcastLobbySettings(roomCode, game);
  });

  // Join existing room
  socket.on('join-room', (roomCode, playerName, callback) => {
    // Connection rate limit: 3s cooldown per IP
    const clientIp = socket.handshake.address || socket.id;
    const nowConn = Date.now();
    const lastConn = connectionRateLimits.get(clientIp) || 0;
    if (nowConn - lastConn < CONNECTION_COOLDOWN_MS) {
      callback({ success: false, error: 'Please wait before trying to create or join a room again' });
      return;
    }
    connectionRateLimits.set(clientIp, nowConn);

    if (typeof playerName !== 'string' || !playerName.trim()) {
      callback({ success: false, error: 'Name cannot be empty' });
      return;
    }
    const cleanName = playerName.trim().substring(0, 20);
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
      // Tournament mode: allow late joiners as spectators
      if (game.tournament && game.tournament.enabled && game.tournament.status === 'active') {
        const isSpectator = true;
        console.log(`JOIN-ROOM: Late joiner ${cleanName} joining as spectator (phase: ${game.phase})`);
        game.players.push({ id: socket.id, name: cleanName, isHost: false, isActive: true, role: 'spectator', hasSubmittedQuestion: false, hasSubmittedAnswer: false });
        socket.join(roomCode);
        socket.roomCode = roomCode;
        callback({ success: true, spectator: true });
        console.log(`${cleanName} joined room ${roomCode} as spectator`);
        io.to(roomCode).emit('player-joined', game.players.filter(p => p.isActive));
        return;
      }
      callback({ success: false, error: 'Game already in progress' });
      return;
    }

    // Prevent duplicate names which break reconnection logic
    if (game.players.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
      callback({ success: false, error: 'Name already taken in this room' });
      return;
    }
    
    console.log(`JOIN-ROOM: Adding ${cleanName} with socket ${socket.id} to room ${roomCode}`);
    console.log(`JOIN-ROOM: Players before:`, game.players.map(p => ({ name: p.name, id: p.id, isActive: p.isActive })));
    
    game.players.push({ id: socket.id, name: cleanName, isHost: false, isActive: true, role: 'player', hasSubmittedQuestion: false, hasSubmittedAnswer: false });
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    console.log(`JOIN-ROOM: Players after:`, game.players.map(p => ({ name: p.name, id: p.id, isActive: p.isActive })));
    
    callback({ success: true });
    console.log(`${cleanName} joined room ${roomCode}`);
    io.to(roomCode).emit('player-joined', game.players.filter(p => p.isActive));

    // Send current lobby settings to the new player
    broadcastLobbySettings(roomCode, game);
  });

  // Host starts the game
  socket.on('start-game', ({ noSelfReading = false, tournament: tournamentConfig = null }) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;
    
    if (game.phase !== 'lobby') {
      console.log(`[start-game] Rejected: Game already started (phase: ${game.phase})`);
      return;
    }
    
    // CRITICAL FIX: Use active players count for minimum check
    const activePlayers = game.players.filter(p => p.isActive);
    if (activePlayers.length < 3) {
      socket.emit('error', 'Need at least 3 active players to start');
      return;
    }
    
    // Store noSelfReading setting for use in performance phase
    game.noSelfReading = noSelfReading;
    console.log(`Room ${roomCode}: No Self-Reading ${noSelfReading ? 'ON' : 'OFF'}`);

    // Reset per-round submission flags and transition guard
    for (const p of activePlayers) {
      p.hasSubmittedQuestion = false;
      p.hasSubmittedAnswer = false;
    }
    game.isTransitioning = false;

    // CRITICAL FIX: Remove any disconnected players from lobby before starting
    game.players = activePlayers;
    game.phase = 'writing';
    game.writingPhaseStartedAt = Date.now();
    game.currentRoundAnonymousMode = game.anonymousMode;

    // Initialize tournament if host configured one
    if (tournamentConfig && tournamentConfig.enabled) {
      game.tournament = {
        enabled: true,
        targetRounds: tournamentConfig.targetRounds || 3,
        votingTimerSeconds: tournamentConfig.votingTimerSeconds || 60,
        speedScoringEnabled: !!tournamentConfig.speedScoringEnabled,
        currentRound: 1,
        scores: {},
        pendingPromotions: [],
        roundSettings: {},
        status: 'active'
      };
      console.log(`[start-game] Tournament enabled: ${game.tournament.targetRounds} rounds, ${game.tournament.votingTimerSeconds}s voting timer`);
    }

    io.to(roomCode).emit('game-started', {
      phase: 'writing',
      anonymousMode: game.anonymousMode,
      totalPlayers: activePlayers.length,
      tournament: game.tournament ? { enabled: true, targetRounds: game.tournament.targetRounds, currentRound: 1, speedScoringEnabled: game.tournament.speedScoringEnabled } : null
    });
  });

  // Host toggles anonymous mode (show/hide names in end-of-game summary)
  socket.on('toggle-anonymous', async () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];

    if (!game || game.host !== socket.id) return;

    if (game.phase !== 'lobby') {
      console.log(`[toggle-anonymous] Rejected: not in lobby (phase: ${game.phase})`);
      socket.emit('error', 'Anonymous mode can only be changed in the lobby');
      return;
    }

    game.anonymousMode = !game.anonymousMode;

    // Save to database
    const db = getDb();
    await db.run("UPDATE games SET anonymous_mode = ? WHERE id = ?", [game.anonymousMode ? 1 : 0, game.dbGameId]);

    // Broadcast to all players in the room
    io.to(roomCode).emit('anonymous-toggled', { anonymousMode: game.anonymousMode });
    broadcastLobbySettings(roomCode, game);
    console.log(`Room ${roomCode}: Anonymous mode ${game.anonymousMode ? 'ON' : 'OFF'}`);
  });

  // Host updates lobby settings (tournament config, no-self-reading)
  socket.on('update-lobby-settings', (settings) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];

    if (!game || game.host !== socket.id) return;

    if (game.phase !== 'lobby') {
      console.log(`[update-lobby-settings] Rejected: not in lobby (phase: ${game.phase})`);
      return;
    }

    // Update tournament config if provided
    if (settings.tournamentConfig) {
      game.tournament = { ...game.tournament, ...settings.tournamentConfig };
    }

    // Update no-self-reading if provided
    if (typeof settings.noSelfReading === 'boolean') {
      game.noSelfReading = settings.noSelfReading;
    }

    broadcastLobbySettings(roomCode, game);
    console.log(`Room ${roomCode}: Lobby settings updated`);
  });

  // Broadcast current lobby settings to all players
  function broadcastLobbySettings(roomCode, game) {
    const settings = {
      anonymousMode: game.anonymousMode,
      noSelfReading: game.noSelfReading,
      tournamentConfig: game.tournament ? {
        enabled: game.tournament.enabled,
        targetRounds: game.tournament.targetRounds,
        votingTimerSeconds: game.tournament.votingTimerSeconds,
        speedScoringEnabled: game.tournament.speedScoringEnabled
      } : { enabled: false, targetRounds: 3, votingTimerSeconds: 60, speedScoringEnabled: false }
    };
    io.to(roomCode).emit('lobby-settings', settings);
  }

  // Player submits question
  socket.on('submit-question', async (question) => {
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
    
    // Input validation
    if (typeof question !== 'string' || !question.trim()) {
      socket.emit('error', 'Question cannot be empty');
      return;
    }
    if (question.length > 500) {
      socket.emit('error', 'Question is too long (max 500 characters)');
      return;
    }
    
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
    if (!player) {
      console.log(`submit-question rejected: player not found in game ${roomCode}`);
      socket.emit('error', 'You are not in this game');
      return;
    }
    if (player.role === 'spectator') {
      socket.emit('error', 'Spectators cannot submit questions');
      return;
    }
    if (player.hasSubmittedQuestion) {
      console.log(`submit-question rejected: duplicate submission from ${player.name}`);
      socket.emit('error', 'You already submitted a question this round');
      return;
    }
    player.hasSubmittedQuestion = true;

    console.log('submit-question: player found:', !!player, 'player name:', player?.name);
    game.questions[socket.id] = {
      text: question,
      authorId: socket.id,
      authorName: player?.name || 'Unknown',
      submittedAt: Date.now()
    };

    // Save question to database
    const db = getDb();
    await db.run("INSERT INTO questions (game_id, text, author_id, author_name, vote_count, anonymous) VALUES (?, ?, ?, ?, ?, ?)", 
      [game.dbGameId, question, socket.id, player?.name || 'Unknown', 0, game.currentRoundAnonymousMode ? 1 : 0]);
    const questionIdResult = await db.exec("SELECT last_insert_rowid() as id");
    const questionId = questionIdResult[0].values[0][0];
    game.questions[socket.id].dbId = questionId;

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
      game.answeringPhaseStartedAt = Date.now();
      console.log(`[distributeQuestions] Game phase set to 'answering'`);

      // Reset answer submission flags and transition guard for the new phase
      for (const p of activePlayers) {
        p.hasSubmittedAnswer = false;
      }
      game.isTransitioning = false;
      
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
  socket.on('submit-answer', async (answer) => {
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
    
    // Input validation
    if (typeof answer !== 'string' || !answer.trim()) {
      socket.emit('error', 'Answer cannot be empty');
      return;
    }
    if (answer.length > 500) {
      socket.emit('error', 'Answer is too long (max 500 characters)');
      return;
    }
    
    const game = games[roomCode];

    if (!game || game.phase !== 'answering') {
      console.log(`Submit-answer rejected: game=${!!game}, phase=${game?.phase}`);
      socket.emit('error', 'Game is not in the answering phase');
      return;
    }
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Submit-answer rejected: Player not found with socket ID ${socket.id}`);
      socket.emit('error', 'You are not in this game');
      return;
    }
    if (player.role === 'spectator') {
      socket.emit('error', 'Spectators cannot submit answers');
      return;
    }
    
    // Duplicate submission guard
    if (player.hasSubmittedAnswer) {
      console.log(`Submit-answer rejected: duplicate answer from ${player.name}`);
      socket.emit('error', 'You already submitted an answer this round');
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
    
    // Synchronous transition guard
    if (game.isTransitioning) {
      console.log(`Submit-answer rejected: transition in progress for room ${roomCode}`);
      socket.emit('error', 'Game is transitioning, please wait');
      return;
    }

    player.hasSubmittedAnswer = true;
    
    try {
      game.answers[socket.id] = {
        text: answer,
        question: assignedQuestion,
        authorId: socket.id,
        authorName: player.name || 'Unknown',
        submittedAt: Date.now()
      };

      // Save answer to database
      const db = getDb();
      await db.run("INSERT INTO answers (game_id, text, author_id, author_name, vote_count, anonymous) VALUES (?, ?, ?, ?, ?, ?)", 
        [game.dbGameId, answer, socket.id, player.name || 'Unknown', 0, game.currentRoundAnonymousMode ? 1 : 0]);
      const answerIdResult = await db.exec("SELECT last_insert_rowid() as id");
      const answerId = answerIdResult[0].values[0][0];
      game.answers[socket.id].dbId = answerId;

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
        if (game.phase === 'answering') {
          console.log('All active players submitted! Starting performance phase...');
          game.isTransitioning = true;
          await preparePerformancePhase(roomCode);
          // isTransitioning cleared inside preparePerformancePhase
        } else {
          console.log('All active players submitted, but phase is no longer answering; transition already handled.');
          game.isTransitioning = false;
        }
      } else {
        io.to(roomCode).emit('progress-update', {
          submitted: Object.keys(game.answers).length,
          total: activePlayers.length,
          playerStatuses: activePlayers.map(p => ({ name: p.name, submitted: !!game.answers[p.id] })),
          firstSubmitter: game.firstAnswerSubmitter,
          lastQuestionSubmitter: game.lastQuestionSubmitter
        });
      }
    } catch (err) {
      console.error(`[submit-answer] Error processing answer from ${player.name}:`, err.message);
      game.isTransitioning = false;
      socket.emit('error', 'Failed to submit answer');
    }
  });

  // Build end-of-game summary with Q&A pairs
  async function buildGameSummary(roomCode) {
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
          let voteCount = 0;
          const pairedAText = answerTurn ? answerTurn.pairedAnswer : null;
          if (game.dbGameId && questionData?.dbId && pairedAText) {
            const pairedAData = Object.values(game.answers).find(a => a.text === pairedAText);
            const pairedAId = pairedAData?.dbId || null;
            if (pairedAId) {
              try {
                // Reuse existing row for this (game, q, a) combo if present (e.g. from prior round or original)
                let existing = await db.exec(
                  "SELECT id, vote_count FROM qa_pairs WHERE game_id = ? AND question_id = ? AND answer_id = ? LIMIT 1",
                  [game.dbGameId, questionData.dbId, pairedAId]
                );
                if (existing.length > 0 && existing[0].values.length > 0) {
                  pairDbId = existing[0].values[0][0];
                  voteCount = existing[0].values[0][1] || 0;
                } else {
                  await db.run(
                    "INSERT INTO qa_pairs (game_id, question_id, answer_id, vote_count, anonymous) VALUES (?, ?, ?, ?, ?)",
                    [game.dbGameId, questionData.dbId, pairedAId, 0, isAnonymous ? 1 : 0]
                  );
                  const pairDbIdResult = await db.exec("SELECT last_insert_rowid() as id");
                  pairDbId = pairDbIdResult[0].values[0][0];
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
                const qRes = await db.exec("SELECT id FROM questions WHERE game_id = ? AND text = ? LIMIT 1", [game.dbGameId, turn.question]);
                const aRes = await db.exec("SELECT id FROM answers WHERE game_id = ? AND text = ? LIMIT 1", [game.dbGameId, turn.actualAnswer]);
                if (qRes.length > 0 && qRes[0].values.length > 0 && aRes.length > 0 && aRes[0].values.length > 0) {
                  const qid = qRes[0].values[0][0];
                  const aid = aRes[0].values[0][0];
                  const pRes = await db.exec("SELECT id, vote_count FROM qa_pairs WHERE game_id = ? AND question_id = ? AND answer_id = ? LIMIT 1", [game.dbGameId, qid, aid]);
                  if (pRes.length > 0 && pRes[0].values.length > 0) {
                    pairDbId = pRes[0].values[0][0];
                    voteCount = pRes[0].values[0][1] || 0;
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
            questionDbId: turn.questionDbId || null,
            actualAnswer: turn.actualAnswer || 'Unknown answer',
            actualAnswerAuthorName: aAuthor,
            actualAnswerDbId: turn.actualAnswerDbId || null,
            pairedAnswer: answerTurn ? answerTurn.pairedAnswer : null,
            pairedAnswerAuthorName: answerTurn ? pAuthor : null,
            pairDbId: pairDbId,
            voteCount: voteCount || 0,
            anonymousMode: isAnonymous,
            questionReactions: turn.questionDbId ? (game.reactions[turn.questionDbId] || {}) : {},
            answerReactions: answerTurn?.pairedAnswerDbId ? (game.reactions[answerTurn.pairedAnswerDbId] || {}) : {}
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
      voteCount: 0,
      anonymousMode: isAnonymous,
      questionReactions: pair.question?.dbId ? (game.reactions[pair.question.dbId] || {}) : {},
      answerReactions: pair.answer?.dbId ? (game.reactions[pair.answer.dbId] || {}) : {}
    }));
  }

  // Compute the player whose written content received the most heart + laugh reactions.
  function computeMostAdoredWriter(roomCode) {
    const game = games[roomCode];
    if (!game) return null;

    // Build reverse map: contentDbId -> { authorId, authorName }
    const authorMap = {};
    for (const entry of Object.values(game.questions || {})) {
      if (entry.dbId) authorMap[entry.dbId] = { authorId: entry.authorId, authorName: entry.authorName };
    }
    for (const entry of Object.values(game.answers || {})) {
      if (entry.dbId) authorMap[entry.dbId] = { authorId: entry.authorId, authorName: entry.authorName };
    }

    const adoredEmojis = ['❤️', '😂'];
    const scores = {}; // authorId -> { name, total }

    for (const [contentDbId, emojiCounts] of Object.entries(game.reactions || {})) {
      const author = authorMap[contentDbId];
      if (!author) continue;
      let count = 0;
      for (const [emoji, c] of Object.entries(emojiCounts)) {
        if (adoredEmojis.includes(emoji)) count += c;
      }
      if (count > 0) {
        if (!scores[author.authorId]) scores[author.authorId] = { name: author.authorName, total: 0 };
        scores[author.authorId].total += count;
      }
    }

    const entries = Object.values(scores);
    if (entries.length === 0) {
      console.log(`[computeMostAdoredWriter] No adored reactions found for room ${roomCode}`);
      return null;
    }
    entries.sort((a, b) => b.total - a.total);
    const top = entries[0];
    const tiedEntries = entries.filter(e => e.total === top.total);
    const tied = tiedEntries.length > 1;
    const names = tiedEntries.map(e => e.name);
    console.log(`[computeMostAdoredWriter] Winner(s): ${names.join(', ')} with ${top.total} reactions (tied=${tied})`);
    return { names, total: top.total, tied };
  }

  // Prepare the performance/reading phase
  async function preparePerformancePhase(roomCode) {
    const game = games[roomCode];
    
    // CRITICAL FIX: Only use active players (not spectators) for performance phase
    const activePlayers = game.players.filter(p => p.isActive && p.role !== 'spectator');
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
        await db.run("INSERT INTO qa_pairs (game_id, question_id, answer_id, vote_count, anonymous) VALUES (?, ?, ?, ?, ?)",
          [game.dbGameId, pair.question.dbId, pair.answer.dbId, 0, game.currentRoundAnonymousMode ? 1 : 0]);
        const pairIdResult = await db.exec("SELECT last_insert_rowid() as id");
        pair.dbId = pairIdResult[0].values[0][0];
      }
    }
    
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

    game.isTransitioning = false;
    
    // Start the chain
    setTimeout(() => {
      startNextReading(roomCode);
    }, 2000);
  }

  // Handle the reading chain - CORRECT LOOP: P1 reads Q → P2 reads A → P2 reads Q → P3 reads A...
  async function startNextReading(roomCode) {
    const game = games[roomCode];
    // CRITICAL FIX: Use stable playerOrder set at start of performing phase, not current player list
    // Filter out null entries from permanently removed players to avoid phantom turns
    const playerIds = (game.playerOrder || game.players.filter(p => p.isActive).map(p => p.id)).filter(id => id !== null);
    const totalTurns = playerIds.length * 2;
    
    if (game.currentReaderIndex >= totalTurns) {
      const summary = await buildGameSummary(roomCode);
      const db = getDb();
      const voterResult = await db.exec("SELECT COUNT(DISTINCT player_id) FROM votes WHERE game_id = ? AND vote_type = 'qa_pair'", [game.dbGameId]);
      const votersCount = voterResult.length > 0 && voterResult[0].values.length > 0 ? voterResult[0].values[0][0] : 0;

      // Tournament mode: enter voting phase with server-side timer
      if (game.tournament && game.tournament.enabled && game.tournament.status === 'active') {
        game.phase = 'voting';
        game.voteWriteQueue = Promise.resolve();
        const votingMs = (game.tournament.votingTimerSeconds || 60) * 1000;
        const votingDeadlineAt = Date.now() + votingMs;
        game.votingDeadlineAt = votingDeadlineAt;
        game.votingTimer = setTimeout(() => closeVotingAndTally(roomCode, 'timer'), votingMs);

        // Mask author names in summary for tournament voting phase
        const maskedSummary = summary.map(p => ({
          ...p,
          questionAuthorName: '???',
          actualAnswerAuthorName: '???',
          pairedAnswerAuthorName: '???'
        }));

        io.to(roomCode).emit('game-ended', {
          message: 'Vote for the best pairing!',
          summary: maskedSummary,
          votersCount: 0,
          firstQuestionSubmitter: game.firstQuestionSubmitter,
          firstAnswerSubmitter: game.firstAnswerSubmitter,
          lastQuestionSubmitter: game.lastQuestionSubmitter,
          lastAnswerSubmitter: game.lastAnswerSubmitter,
          mostAdoredWriter: computeMostAdoredWriter(roomCode),
          tournament: {
            enabled: true,
            currentRound: game.tournament.currentRound,
            targetRounds: game.tournament.targetRounds,
            votingDeadlineAt,
            serverNow: Date.now()
          }
        });
        console.log(`[startNextReading] Tournament voting phase started for room ${roomCode}, deadline at ${votingDeadlineAt}`);
        return;
      }

      // Classic mode: unchanged behavior
      io.to(roomCode).emit('game-ended', {
        message: 'Thanks for playing!',
        summary: summary,
        votersCount: votersCount,
        firstQuestionSubmitter: game.firstQuestionSubmitter,
        firstAnswerSubmitter: game.firstAnswerSubmitter,
        lastQuestionSubmitter: game.lastQuestionSubmitter,
        lastAnswerSubmitter: game.lastAnswerSubmitter,
        mostAdoredWriter: computeMostAdoredWriter(roomCode)
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
      questionDbId: isQuestionTurn ? (cardForQuestion.question?.dbId || null) : null,
      actualAnswer: isQuestionTurn ? (cardForQuestion.answer?.text || null) : null,
      actualAnswerAuthor: isQuestionTurn ? (cardForQuestion.answer?.authorName || null) : null,
      actualAnswerAuthorId: isQuestionTurn ? (cardForQuestion.answer?.authorId || null) : null,
      actualAnswerDbId: isQuestionTurn ? (cardForQuestion.answer?.dbId || null) : null,
      pairedAnswer: isQuestionTurn ? null : (cardForAnswer.answer?.text || null),
      pairedAnswerAuthor: isQuestionTurn ? null : (cardForAnswer.answer?.authorName || null),
      pairedAnswerAuthorId: isQuestionTurn ? null : (cardForAnswer.answer?.authorId || null),
      pairedAnswerDbId: isQuestionTurn ? null : (cardForAnswer.answer?.dbId || null)
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
      currentContentDbId: isQuestionTurn ? cardForQuestion.question?.dbId : cardForAnswer.answer?.dbId,
      currentContentAuthorId: isQuestionTurn ? cardForQuestion.question?.authorId : cardForAnswer.answer?.authorId,
      currentContentType: isQuestionTurn ? 'question' : 'answer',
      round: game.currentReaderIndex + 1,
      total: totalTurns,
      isQuestionTurn: isQuestionTurn
    });
  }

  // Player confirms they finished reading
  socket.on('reading-complete', async () => {
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
    // Filter out null entries from permanently removed players
    const playerIds = (game.playerOrder || game.players.filter(p => p.isActive).map(p => p.id)).filter(id => id !== null);
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

  // Reaction handler (emoji reactions during performance)
  socket.on('reaction', ({ emoji, x, y, contentDbId }) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !games[roomCode]) return;
    const game = games[roomCode];
    if (!game || game.phase !== 'performing') return;

    // Find which content is currently being read to validate
    const turn = game.turnLog[game.turnLog.length - 1];
    if (!turn) return;
    const targetId = contentDbId;
    if (!targetId) return;

    // Prevent self-reaction: look up current owner of the content from game state
    // (handles reconnects where socket.id changes)
    let contentAuthorId = null;
    if (turn.isQuestionTurn) {
      const qEntry = Object.entries(game.questions).find(([_, q]) => q.dbId === targetId);
      contentAuthorId = qEntry ? qEntry[0] : turn.questionAuthorId;
    } else {
      const aEntry = Object.entries(game.answers).find(([_, a]) => a.dbId === targetId);
      contentAuthorId = aEntry ? aEntry[0] : turn.pairedAnswerAuthorId;
    }
    if (contentAuthorId === socket.id) {
      socket.emit('error', 'You cannot react to your own content');
      return;
    }

    // One reaction per player per content (use stable player.name, not socket.id)
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;
    const stableId = player.name;

    if (!game.playerReactions[targetId]) game.playerReactions[targetId] = new Set();
    if (game.playerReactions[targetId].has(stableId)) {
      socket.emit('error', 'You already reacted to this');
      return;
    }

    // Record reaction
    game.playerReactions[targetId].add(stableId);
    if (!game.reactions[targetId]) game.reactions[targetId] = {};
    game.reactions[targetId][emoji] = (game.reactions[targetId][emoji] || 0) + 1;

    // Broadcast visual reaction + updated counts
    io.to(roomCode).emit('reaction', { emoji, x, y });
    io.to(roomCode).emit('reaction-counts', {
      contentDbId: targetId,
      counts: game.reactions[targetId],
      total: game.playerReactions[targetId].size
    });
  });

  // ─── Tournament: close voting and tally scores ───
  async function closeVotingAndTally(roomCode, trigger) {
    const game = games[roomCode];
    if (!game || game.phase !== 'voting') return; // idempotent guard
    game.phase = 'tallying';
    clearTimeout(game.votingTimer);

    // Drain in-flight vote DB writes
    await game.voteWriteQueue;

    // Fetch current pair vote counts from DB
    const db = getDb();
    const voteRows = await db.exec(
      "SELECT target_id, COUNT(*) as cnt FROM votes WHERE game_id = ? AND vote_type = 'qa_pair' GROUP BY target_id",
      [game.dbGameId]
    );
    const votesByPair = {};
    if (voteRows.length > 0) {
      for (const row of voteRows[0].values) {
        votesByPair[row[0]] = row[1];
      }
    }

    // Build pairs array for calculateRoundPoints from cardPairs
    const pairsForTally = (game.cardPairs || []).filter(p => p.dbId).map(p => ({
      pairDbId: p.dbId,
      questionAuthor: p.question?.authorName || 'Unknown',
      answerAuthor: p.answer?.authorName || 'Unknown'
    }));

    // Build speed data from submission timestamps (if speed scoring is enabled)
    const speedScoringEnabled = !!game.tournament.speedScoringEnabled;
    let scoringSettings = {};
    if (speedScoringEnabled) {
      const activePlayerCount = game.players.filter(p => p.isActive && p.role !== 'spectator').length;
      const writingStart = game.writingPhaseStartedAt || 0;
      const answeringStart = game.answeringPhaseStartedAt || 0;

      // Build question times from game.questions
      const questionTimes = [];
      for (const [socketId, q] of Object.entries(game.questions)) {
        if (q.submittedAt && q.authorName) {
          questionTimes.push({ name: q.authorName, ms: q.submittedAt - writingStart });
        }
      }

      // Build answer times from game.answers
      const answerTimes = [];
      for (const [socketId, a] of Object.entries(game.answers)) {
        if (a.submittedAt && a.authorName) {
          answerTimes.push({ name: a.authorName, ms: a.submittedAt - answeringStart });
        }
      }

      scoringSettings = {
        speedScoringEnabled: true,
        speedData: { questionTimes, answerTimes, activePlayerCount, phaseStartedAt: writingStart }
      };
    }

    // Store per-round settings for historical consistency
    game.tournament.roundSettings[game.tournament.currentRound] = { speedScoringEnabled };

    const roundResult = calculateRoundPoints(pairsForTally, votesByPair, scoringSettings);
    mergeRoundScores(game.tournament.scores, roundResult, game.tournament.currentRound);

    // Build author reveal map for the frontend
    const authorsReveal = {};
    for (const pair of (game.cardPairs || [])) {
      if (pair.dbId) {
        authorsReveal[pair.dbId] = {
          qAuthor: pair.question?.authorName || 'Unknown',
          aAuthor: pair.answer?.authorName || 'Unknown'
        };
      }
    }

    // Build unmasked summary for scoreboard display
    const fullSummary = await buildGameSummary(roomCode);

    const { standings } = resolveStandings(game.tournament.scores);
    const isFinalRound = game.tournament.currentRound >= game.tournament.targetRounds;
    const scoreboardMs = 20000;
    const scoreboardDeadlineAt = Date.now() + scoreboardMs;

    game.phase = 'scoreboard';
    game.scoreboardDeadlineAt = scoreboardDeadlineAt;
    game.tournament.lastRoundResult = { standings, roundWinnerDetails: roundResult.roundWinnerDetails, speedDetails: roundResult.speedDetails };
    game.tournament.scoreboardDeadlineAt = scoreboardDeadlineAt;
    game.scoreboardTimer = setTimeout(() => advanceRound(roomCode, 'timer'), scoreboardMs);

    io.to(roomCode).emit('scoreboard', {
      standings,
      roundWinnerDetails: roundResult.roundWinnerDetails,
      summary: fullSummary,
      authorsReveal,
      speedDetails: roundResult.speedDetails,
      scoringRules: { speedScoringEnabled },
      currentRound: game.tournament.currentRound,
      targetRounds: game.tournament.targetRounds,
      isFinalRound,
      deadlineAt: scoreboardDeadlineAt,
      serverNow: Date.now()
    });
    console.log(`[closeVotingAndTally] Room ${roomCode} entered scoreboard (trigger: ${trigger}), round ${game.tournament.currentRound}/${game.tournament.targetRounds}`);
  }

  // ─── Tournament: advance to next round or complete ───
  async function advanceRound(roomCode, trigger) {
    const game = games[roomCode];
    if (!game || game.phase !== 'scoreboard') return; // idempotent guard
    clearTimeout(game.scoreboardTimer);

    const isFinalRound = game.tournament.currentRound >= game.tournament.targetRounds;

    if (isFinalRound) {
      // Tournament complete
      game.phase = 'tournament_complete';
      game.tournament.status = 'complete';
      const { champions, isTie, standings } = resolveStandings(game.tournament.scores);
      game.tournament.finalStandings = { champions, isTie, standings };
      io.to(roomCode).emit('tournament-complete', { champions, isTie, standings });
      console.log(`[advanceRound] Room ${roomCode} tournament complete (trigger: ${trigger})`);
      return;
    }

    // Apply pending promotions (spectator → player)
    for (const name of game.tournament.pendingPromotions) {
      const player = game.players.find(p => p.name === name);
      if (player && player.role === 'spectator') {
        player.role = 'player';
        if (!game.tournament.scores[name]) {
          game.tournament.scores[name] = {
            total: 0, roundScores: [], firstPlaces: 0, votesReceived: 0,
            joinedAtRound: game.tournament.currentRound + 1, leftGame: false
          };
        }
        console.log(`[advanceRound] Promoted ${name} to player for round ${game.tournament.currentRound + 1}`);
      }
    }
    game.tournament.pendingPromotions = [];

    // Increment round
    game.tournament.currentRound++;

    // Reset round state (same as replay-game but preserving tournament)
    const prevLastQuestionSubmitter = game.lastQuestionSubmitter;
    game.phase = 'writing';
    game.writingPhaseStartedAt = Date.now();
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
    game.lastQuestionSubmitter = prevLastQuestionSubmitter;
    game.lastAnswerSubmitter = null;
    game.isTransitioning = false;
    game.voteWriteQueue = Promise.resolve();

    for (const p of game.players) {
      p.hasSubmittedQuestion = false;
      p.hasSubmittedAnswer = false;
    }

    // Clear votes for next round
    try {
      const db = getDb();
      await db.run("DELETE FROM votes WHERE game_id = ?", [game.dbGameId]);
    } catch (e) {
      console.error('[advanceRound] Failed to clear votes:', e.message);
    }

    io.to(roomCode).emit('game-restarted', {
      phase: 'writing',
      lastQuestionSubmitter: game.lastQuestionSubmitter,
      tournament: { currentRound: game.tournament.currentRound, targetRounds: game.tournament.targetRounds }
    });
    io.to(roomCode).emit('player-joined', { players: game.players.filter(p => p.isActive), hostId: game.host });
    console.log(`[advanceRound] Room ${roomCode} started round ${game.tournament.currentRound} (trigger: ${trigger})`);
  }

  // ─── Tournament socket handlers ───

  // Host manually finishes voting
  socket.on('finish-voting', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (game.phase !== 'voting') return;
    closeVotingAndTally(roomCode, 'host');
  });

  // Host manually advances to next round from scoreboard
  socket.on('next-round', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (game.phase !== 'scoreboard') return;
    advanceRound(roomCode, 'host');
  });

  // Host starts a new tournament (from tournament-complete screen)
  socket.on('new-tournament', () => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (game.phase !== 'tournament_complete') return;

    // Reset tournament scores but keep players
    game.tournament.currentRound = 1;
    game.tournament.scores = {};
    game.tournament.pendingPromotions = [];
    game.tournament.roundSettings = {};
    game.tournament.status = 'active';

    // Reset all players to player role (spectators from last tournament stay spectators)
    // Host decides who plays via promotions

    // Reset round state
    game.phase = 'lobby';
    game.questions = {};
    game.answers = {};
    game.questionAssignments = {};
    game.cardPairs = [];
    game.shuffledCards = [];
    game.cardAssignments = {};
    game.currentReaderIndex = 0;
    game.playerOrder = [];
    game.isTransitioning = false;

    io.to(roomCode).emit('tournament-reset', { tournament: { enabled: true, targetRounds: game.tournament.targetRounds } });
    io.to(roomCode).emit('player-joined', { players: game.players.filter(p => p.isActive), hostId: game.host });
    console.log(`[new-tournament] Room ${roomCode} reset for new tournament`);
  });

  // Host promotes a spectator to player (takes effect next round)
  socket.on('promote-player', ({ playerName }) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (!game.tournament || !game.tournament.enabled) return;

    const player = game.players.find(p => p.name === playerName);
    if (!player || player.role !== 'spectator') {
      socket.emit('error', 'Player is not a spectator');
      return;
    }

    if (!game.tournament.pendingPromotions.includes(playerName)) {
      game.tournament.pendingPromotions.push(playerName);
    }
    console.log(`[promote-player] ${playerName} queued for promotion in room ${roomCode}`);
    io.to(roomCode).emit('promotion-queued', { playerName });
  });

  // Player submits a vote (non-blocking during performance phase)
  socket.on('submit-vote', async ({ type, targetId }) => {
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

    // Tournament phase guard: reject votes outside the voting phase
    if (game.tournament && game.tournament.enabled) {
      if (game.phase !== 'voting') {
        socket.emit('vote-submitted', { success: false, message: 'Voting is closed for this round' });
        return;
      }
    }

    // Resolve stable player identity (player.name) for vote tracking
    const voter = game.players.find(p => p.id === socket.id);
    if (!voter) {
      socket.emit('vote-submitted', { success: false, message: 'You are not in this game' });
      return;
    }
    if (voter.role === 'spectator') {
      socket.emit('vote-submitted', { success: false, message: 'Spectators cannot vote' });
      return;
    }
    const stableVoterId = voter.name;

    // Rate limit votes per socket
    const now = Date.now();
    const last = lastVoteTime.get(socket.id) || 0;
    if (now - last < VOTE_RATE_LIMIT_MS) {
      socket.emit('vote-submitted', { success: false, message: 'Please wait a moment before voting again' });
      return;
    }
    lastVoteTime.set(socket.id, now);

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
    const existingVote = await db.exec(
      "SELECT id FROM votes WHERE game_id = ? AND player_id = ? AND vote_type = ? AND target_id = ?",
      [game.dbGameId, stableVoterId, type, targetId]
    );
    if (existingVote.length > 0 && existingVote[0].values.length > 0) {
      const voteId = existingVote[0].values[0][0];
      await db.run("DELETE FROM votes WHERE id = ?", [voteId]);
      await db.run(`UPDATE ${tableName} SET vote_count = CASE WHEN vote_count > 0 THEN vote_count - 1 ELSE 0 END WHERE id = ?`, [targetId]);
      const result = await db.exec(`SELECT vote_count FROM ${tableName} WHERE id = ?`, [targetId]);
      const voteCount = result.length > 0 ? result[0].values[0][0] : 0;
      const voterResult = await db.exec("SELECT COUNT(DISTINCT player_id) FROM votes WHERE game_id = ? AND vote_type = 'qa_pair'", [game.dbGameId]);
      const votersCount = voterResult.length > 0 && voterResult[0].values.length > 0 ? voterResult[0].values[0][0] : 0;
      socket.emit('vote-submitted', { success: true, targetId, voteCount, isVoted: false });
      io.to(roomCode).emit('vote-update', { type, targetId, voteCount, votersCount });
      return;
    }

    // Enforce single active vote per player for qa_pair across different targets
    if (type === 'qa_pair') {
      const otherVote = await db.exec(
        "SELECT id FROM votes WHERE game_id = ? AND player_id = ? AND vote_type = ? LIMIT 1",
        [game.dbGameId, stableVoterId, type]
      );
      if (otherVote.length > 0 && otherVote[0].values.length > 0) {
        socket.emit('vote-submitted', { success: false, message: 'Already voted for another pairing. Click your vote to undo first.' });
        return;
      }
    }

    // Insert new vote and increment count — chain onto voteWriteQueue for tournament atomicity
    const voteWritePromise = (async () => {
      await db.run("INSERT INTO votes (game_id, player_id, vote_type, target_id) VALUES (?, ?, ?, ?)", [game.dbGameId, stableVoterId, type, targetId]);
      await db.run(`UPDATE ${tableName} SET vote_count = vote_count + 1 WHERE id = ?`, [targetId]);
    })();

    if (game.tournament && game.tournament.enabled) {
      game.voteWriteQueue = game.voteWriteQueue.then(() => voteWritePromise);
    }
    await voteWritePromise;

    const result = await db.exec(`SELECT vote_count FROM ${tableName} WHERE id = ?`, [targetId]);
    const voteCount = result.length > 0 ? result[0].values[0][0] : 0;
    const voterResult = await db.exec("SELECT COUNT(DISTINCT player_id) FROM votes WHERE game_id = ? AND vote_type = 'qa_pair'", [game.dbGameId]);
    const votersCount = voterResult.length > 0 && voterResult[0].values.length > 0 ? voterResult[0].values[0][0] : 0;

    // Tournament: include author reveal in vote-submitted ack
    let authorReveal = null;
    if (game.tournament && game.tournament.enabled && type === 'qa_pair') {
      const pair = (game.cardPairs || []).find(p => p.dbId === targetId);
      if (pair) {
        authorReveal = {
          qAuthor: pair.question?.authorName || 'Unknown',
          aAuthor: pair.answer?.authorName || 'Unknown'
        };
      }
    }

    socket.emit('vote-submitted', { success: true, targetId, voteCount, isVoted: true, authorReveal });
    io.to(roomCode).emit('vote-update', { type, targetId, voteCount, votersCount });

    // Tournament: auto-close voting when all active players have voted
    if (game.tournament && game.tournament.enabled && game.phase === 'voting' && type === 'qa_pair') {
      const activePlayers = game.players.filter(p => p.isActive && p.role === 'player');
      const distinctVotersResult = await db.exec(
        "SELECT DISTINCT player_id FROM votes WHERE game_id = ? AND vote_type = 'qa_pair'",
        [game.dbGameId]
      );
      const votedPlayerIds = new Set();
      if (distinctVotersResult.length > 0) {
        for (const row of distinctVotersResult[0].values) {
          votedPlayerIds.add(row[0]);
        }
      }
      const allPlayersVoted = activePlayers.every(p => votedPlayerIds.has(p.name));
      if (allPlayersVoted && activePlayers.length > 0) {
        console.log(`[submit-vote] All ${activePlayers.length} players voted — auto-closing voting for room ${roomCode}`);
        closeVotingAndTally(roomCode, 'all-voted');
      }
    }

    return;
  });

  // Host replays game with same players
  socket.on('replay-game', async (payload = {}) => {
    const roomCode = socket.roomCode;
    const game = games[roomCode];
    
    if (!game || game.host !== socket.id) return;

    // Block replay-game during tournament phases — use next-round or new-tournament instead
    if (game.tournament && game.tournament.enabled && game.phase !== 'ended') {
      socket.emit('error', 'Use Next Round or New Tournament during tournament mode');
      return;
    }

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
    game.writingPhaseStartedAt = Date.now();
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

    // Reset per-round submission flags and transition guard
    for (const p of game.players) {
      p.hasSubmittedQuestion = false;
      p.hasSubmittedAnswer = false;
    }
    game.isTransitioning = false;

    // Clear the previous round's vote rows for this game so players aren't
    // blocked from voting again in the replayed round. The denormalized
    // vote_count totals on questions/answers/qa_pairs are preserved, so the
    // Best Of page still reflects all previously cast votes.
    try {
      const db = getDb();
      await db.run("DELETE FROM votes WHERE game_id = ?", [game.dbGameId]);
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
  socket.on('force-progress', async () => {
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
      const toKickNames = new Set(toKick.map(p => p.name));
      const remainingActiveCount = game.players.filter(p => !toKickNames.has(p.name) && p.isActive).length;
      if (remainingActiveCount < 2) {
        console.log(`[FORCE-PROGRESS] Aborting kick: only ${remainingActiveCount} active players would remain`);
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
        return;
      }
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
      const toKickNames = new Set(toKick.map(p => p.name));
      const remainingActiveCount = game.players.filter(p => !toKickNames.has(p.name) && p.isActive).length;
      if (remainingActiveCount < 2) {
        console.log(`[FORCE-PROGRESS] Aborting kick: only ${remainingActiveCount} active players would remain`);
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
        return;
      }
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
      const playerIds = (game.playerOrder || activePlayers.map(p => p.id)).filter(id => id !== null);
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

  // Host toggles a player's spectator role from the lobby roster
  socket.on('host-set-spectator', ({ playerId, isSpectator }) => {
    let roomCode = socket.roomCode;
    if (!roomCode && socket.rooms) {
      const rooms = Array.from(socket.rooms);
      const gameRoom = rooms.find(r => r !== socket.id);
      if (gameRoom) roomCode = gameRoom;
    }
    const game = games[roomCode];
    if (!game || game.host !== socket.id) return;
    if (!playerId || playerId === socket.id) {
      socket.emit('error', "Can't change your own role");
      return;
    }
    const target = game.players.find(p => p.id === playerId);
    if (!target) {
      socket.emit('error', 'Player not found');
      return;
    }
    if (game.phase !== 'lobby') {
      socket.emit('error', 'Spectator role can only be changed in the lobby');
      return;
    }
    const nextRole = isSpectator ? 'spectator' : undefined;
    target.role = nextRole;
    console.log(`[HOST-SET-SPECTATOR] ${target.name} in room ${roomCode} → ${isSpectator ? 'spectator' : 'player'}`);
    const activePlayers = game.players.filter(p => p.isActive);
    io.to(roomCode).emit('player-left', { players: activePlayers, hostId: game.host });
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

  // Non-host player abandons the game from the summary screen
  socket.on('player-abandon', () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !games[roomCode]) return;
    const game = games[roomCode];
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    console.log(`[ABANDON] ${player.name} abandoned game in room ${roomCode}`);

    const wasHost = game.host === socket.id;
    removePlayerFromGame(roomCode, socket.id);
    socket.leave(roomCode);
    socket.roomCode = null;

    if (game.players.length === 0) {
      delete games[roomCode];
      return;
    }

    // Transfer host if the abandoning player was the host
    if (wasHost) {
      const hostChanged = ensureHost(roomCode);
      if (hostChanged) {
        const newHost = game.players.find(p => p.isHost);
        if (newHost) {
          io.to(roomCode).emit('host-changed', { hostId: newHost.id, hostName: newHost.name });
        }
      }
    }

    // If the game is still in an active phase, disband if too few players remain
    if (disbandIfBelowMinimum(roomCode)) return;

    io.to(roomCode).emit('player-left', { players: game.players.filter(p => p.isActive), hostId: game.host });
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

  // Lightweight presence check: client asks "am I still active in this room?"
  // Used by the Page Visibility handler after phone wake-up.
  socket.on('check-presence', ({ roomCode, playerName }) => {
    const game = games[roomCode];
    if (!game) { socket.emit('presence-stale', { reason: 'room-gone' }); return; }
    // CRITICAL FIX: Look up by player name instead of socket.id, because
    // reconnection changes the player's id to the new socket.id
    const player = game.players.find(p => p.name === playerName && p.isActive);
    if (!player) { socket.emit('presence-stale', { reason: 'reconnect-needed' }); }
    // If player is found and active, no response needed – client is fine.
  });

  // Handle player reconnection within grace period
  socket.on('reconnect-player', async ({ roomCode, playerName }) => {
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
      socket.emit('reconnect-failed', { reason: 'Player not found in room (may have been removed)', roomCode, playerName });
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
        if (oldSocket.rooms && oldSocket.rooms.has(roomCode)) {
          oldSocket.leave(roomCode);
        }
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
    
    if (timeSinceDisconnect > 180000) {
      game.players = game.players.filter(p => p.name !== playerName);
      socket.emit('reconnect-failed', { reason: 'Reconnection window expired (3 minutes)', roomCode, playerName });
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

    // Restore submission flags based on migrated state
    player.hasSubmittedQuestion = !!game.questions[socket.id];
    player.hasSubmittedAnswer = !!game.answers[socket.id];
    
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
    
    // 7. Migrate this player's reaction records so the new socket id is authoritative.
    // Since playerReactions now uses stable player.name, the player's name doesn't
    // change on reconnect. We only need to clean up any legacy socket.id entries.
    if (game.playerReactions) {
      for (const reactors of Object.values(game.playerReactions)) {
        if (reactors.has(oldSocketId)) {
          reactors.delete(oldSocketId);
          reactors.add(player.name);
        }
      }
    }
    
    socket.join(roomCode);
    // Ensure socket.roomCode is set after joining the room
    socket.roomCode = roomCode;
    console.log(`Reconnection: socket joined room ${roomCode}, socket.id: ${socket.id}, socket.roomCode set to:`, socket.roomCode);
    
    // Build comprehensive reconnection state for frontend
    let assignedQuestion = null;
    if (game.phase === 'answering' && game.questionAssignments) {
      if (game.questionAssignments[socket.id]) {
        // Normal case: player had an assignment, already migrated above
        assignedQuestion = game.questionAssignments[socket.id];
      } else {
        // Bug fix: player was absent when distributeQuestions ran, so they have no assignment.
        // Find any question that is not assigned to anyone and not authored by this player.
        const assignedValues = Object.values(game.questionAssignments);
        const assignedTexts = new Set(assignedValues.map(q => q.text));
        const fallback = Object.values(game.questions).find(q =>
          q.authorId !== socket.id && !assignedTexts.has(q.text)
        );
        if (fallback) {
          game.questionAssignments[socket.id] = fallback;
          assignedQuestion = fallback;
          console.log(`[RECONNECT] Assigned fallback question to ${playerName}: "${fallback.text.slice(0, 40)}"`);
        } else {
          // Last resort: assign any question not authored by this player
          const anyQ = Object.values(game.questions).find(q => q.authorId !== socket.id);
          if (anyQ) {
            game.questionAssignments[socket.id] = anyQ;
            assignedQuestion = anyQ;
            console.log(`[RECONNECT] Assigned last-resort question to ${playerName}`);
          }
        }
      }
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

    // Collect the content IDs this player already reacted to so the frontend can
    // keep the reaction buttons disabled after reconnecting.
    const reactedContentIds = [];
    if (game.playerReactions) {
      for (const [contentDbId, reactors] of Object.entries(game.playerReactions)) {
        if (reactors.has(player.name)) reactedContentIds.push(contentDbId);
      }
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
      submittedQuestion: alreadySubmittedQuestion ? game.questions[socket.id] : null,
      progress: progress,
      anonymousMode: !!game.anonymousMode,
      reactedContentIds: reactedContentIds
    };

    // If reconnecting during ended phase, include the game summary and current vote state
    if (game.phase === 'ended' || game.phase === 'voting') {
      reconnectData.summary = await buildGameSummary(roomCode);
      reconnectData.mostAdoredWriter = computeMostAdoredWriter(roomCode);
      const db = getDb();
      const voterResult = await db.exec("SELECT COUNT(DISTINCT player_id) FROM votes WHERE game_id = ? AND vote_type = 'qa_pair'", [game.dbGameId]);
      reconnectData.votersCount = voterResult.length > 0 && voterResult[0].values.length > 0 ? voterResult[0].values[0][0] : 0;
      reconnectData.firstQuestionSubmitter = game.firstQuestionSubmitter || null;
      reconnectData.firstAnswerSubmitter = game.firstAnswerSubmitter || null;
      reconnectData.lastQuestionSubmitter = game.lastQuestionSubmitter || null;
      reconnectData.lastAnswerSubmitter = game.lastAnswerSubmitter || null;

      // Tournament: include tournament state for voting phase
      if (game.tournament && game.tournament.enabled) {
        reconnectData.tournament = {
          enabled: true,
          currentRound: game.tournament.currentRound,
          targetRounds: game.tournament.targetRounds,
          votingDeadlineAt: game.tournament.votingDeadlineAt || null,
          serverNow: Date.now()
        };
      }

      // Restore this player's existing votes so the frontend can show vote state
      const voteRows = await db.exec("SELECT vote_type, target_id FROM votes WHERE game_id = ? AND player_id = ?", [game.dbGameId, player.name]);
      const userVotes = {};
      if (voteRows.length > 0 && voteRows[0].values.length > 0) {
        for (const row of voteRows[0].values) {
          const [voteType, targetId] = row;
          userVotes[targetId] = true;
          if (voteType === 'qa_pair') {
            reconnectData.summaryPairVoteId = targetId;
          }
        }
      }
      reconnectData.userVotes = userVotes;

      // Restore summary vote counts so the frontend shows correct tallies
      const summaryVotes = {};
      const qaPairVotes = await db.exec("SELECT id, vote_count FROM qa_pairs WHERE game_id = ?", [game.dbGameId]);
      if (qaPairVotes.length > 0 && qaPairVotes[0].values.length > 0) {
        for (const row of qaPairVotes[0].values) {
          summaryVotes[row[0]] = row[1];
        }
      }
      reconnectData.summaryVotes = summaryVotes;

      // Restore round history so the reconnecting player can view past rounds
      if (reconnectData.summary && reconnectData.summary.length > 0) {
        reconnectData.roundHistory = [{
          summary: reconnectData.summary,
          anonymousMode: !!game.anonymousMode,
          timestamp: Date.now()
        }];
      }
    }

    // Tournament: reconnect into scoreboard or tournament_complete phase
    if (game.tournament && game.tournament.enabled && (game.phase === 'scoreboard' || game.phase === 'tournament_complete')) {
      if (game.phase === 'scoreboard' && game.tournament.lastRoundResult) {
        const roundSettings = game.tournament.roundSettings[game.tournament.currentRound] || {};
        reconnectData.scoreboardData = {
          standings: game.tournament.lastRoundResult.standings,
          roundWinnerDetails: game.tournament.lastRoundResult.roundWinnerDetails,
          speedDetails: game.tournament.lastRoundResult.speedDetails || null,
          scoringRules: { speedScoringEnabled: !!roundSettings.speedScoringEnabled },
          currentRound: game.tournament.currentRound,
          targetRounds: game.tournament.targetRounds,
          isFinalRound: game.tournament.currentRound >= game.tournament.targetRounds,
          deadlineAt: game.tournament.scoreboardDeadlineAt || null,
          serverNow: Date.now()
        };
      }
      if (game.phase === 'tournament_complete' && game.tournament.finalStandings) {
        reconnectData.tournamentCompleteData = {
          champions: game.tournament.finalStandings.champions,
          isTie: game.tournament.finalStandings.isTie,
          standings: game.tournament.finalStandings.standings
        };
      }
      reconnectData.tournament = {
        enabled: true,
        currentRound: game.tournament.currentRound,
        targetRounds: game.tournament.targetRounds
      };
    }

    // If reconnecting during performance phase, the fresh current-turn state is delivered
    // via the 'reading-turn' event emitted below, so we don't duplicate it here.

    socket.emit('reconnected', reconnectData);
    
    console.log(`[RECONNECT] Sent reconnected event to ${playerName} (phase=${game.phase})`);
    
    // Notify all players that this player has reconnected (updates player lists with correct isHost status)
    io.to(roomCode).emit('player-joined', { players: activePlayers, hostId: game.host });
    console.log(`[RECONNECT] Notified room ${roomCode} that ${playerName} reconnected`);
    
    // If reconnecting during performing phase, send current turn state
    if (game.phase === 'performing') {
      const playerIds = (game.playerOrder || activePlayers.map(p => p.id)).filter(id => id !== null);
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
        const questionDbId = cardForQuestion.question?.dbId || null;
        const answerDbId = cardForAnswer.answer?.dbId || null;
        socket.emit('reading-turn', {
          questionReader: { id: questionReaderId, name: game.players.find(p => p.id === questionReaderId)?.name || 'Unknown' },
          answerReader: { id: answerReaderId, name: game.players.find(p => p.id === answerReaderId)?.name || 'Unknown' },
          question: cardForQuestion.question.text,
          answer: isQuestionTurn ? null : cardForAnswer.answer.text,
          questionDbId: questionDbId,
          answerDbId: answerDbId,
          currentContentDbId: isQuestionTurn ? questionDbId : answerDbId,
          currentContentAuthorId: isQuestionTurn ? cardForQuestion.question?.authorId : cardForAnswer.answer?.authorId,
          currentContentType: isQuestionTurn ? 'question' : 'answer',
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

    // Bug fix: if player reconnects during writing and had already submitted,
    // check if everyone else has now submitted too and trigger distributeQuestions.
    if (game.phase === 'writing' && game.questions[socket.id]) {
      const nowActive = game.players.filter(p => p.isActive);
      if (nowActive.length >= 3 && nowActive.every(p => game.questions[p.id])) {
        console.log(`[RECONNECT] ${playerName} rejoined during writing with question already submitted — all active players ready, distributing now`);
        distributeQuestions(roomCode);
      }
    }

    // Same logic for answering phase: if all active players have answers, advance to performance.
    if (game.phase === 'answering' && game.answers[socket.id]) {
      const nowActive = game.players.filter(p => p.isActive);
      if (nowActive.length >= 2 && nowActive.every(p => game.answers[p.id])) {
        console.log(`[RECONNECT] ${playerName} rejoined during answering with answer already submitted — all active players ready, moving to performance`);
        preparePerformancePhase(roomCode);
      }
    }

    console.log(`[RECONNECT] ${playerName} reconnected to room ${roomCode} successfully`);
  });

  // Handle disconnect: lobby and in-game use a 180s reconnect grace window;
  // ended phase removes silently.
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    lastVoteTime.delete(socket.id);
    clearSocketRate(socket.id);

    const roomCode = socket.roomCode;
    if (!roomCode || !games[roomCode]) return;
    const game = games[roomCode];
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
      console.log(`Disconnect - No player found with socket.id ${socket.id}`);
      return;
    }

    const wasHost = game.host === socket.id;

    // Lobby disconnect: now uses the same 180-second grace period as active
    // phases so hosts and players can reconnect after a brief mobile drop.
    // Inactive players are still filtered out when the game starts.
    if (game.phase === 'lobby') {
      console.log(`Disconnect (lobby) - ${player.name} marked inactive, 180s grace`);
      player.isActive = false;
      player.disconnectedAt = Date.now();

      // Keep the original host as host while they are in the grace period; if they
      // are permanently removed later, the grace timeout will transfer host.
      io.to(roomCode).emit('player-disconnected', {
        players: game.players.filter(p => p.isActive),
        disconnectedPlayer: player.name,
        gracePeriod: 180
      });

      player.reconnectTimeout = setTimeout(() => {
        const stillThere = games[roomCode];
        if (!stillThere) return;
        const stillDisconnected = stillThere.players.find(p => p.name === player.name && !p.isActive);
        if (!stillDisconnected) {
          console.log(`[grace-timeout] ${player.name} no longer matches a disconnected player - skipping`);
          return;
        }
        console.log(`[grace-timeout] Permanently removing ${stillDisconnected.name} from lobby`);
        removePlayerFromGame(roomCode, stillDisconnected.id);

        if (stillThere.players.length === 0) {
          delete games[roomCode];
          return;
        }

        // Transfer host if the original host was the one removed
        if (wasHost) {
          const hostChanged = ensureHost(roomCode);
          if (hostChanged) {
            const newHost = stillThere.players.find(p => p.isHost);
            if (newHost) {
              io.to(roomCode).emit('host-changed', { hostId: newHost.id, hostName: newHost.name });
            }
          }
        }

        io.to(roomCode).emit('player-left', { players: stillThere.players.filter(p => p.isActive), hostId: stillThere.host });
      }, 180000);
      return;
    }

    // Ended phase: just remove silently (game is already over)
    if (game.phase === 'ended') {
      removePlayerFromGame(roomCode, socket.id);
      if (game.players.length === 0) delete games[roomCode];
      return;
    }

    // In-game disconnect: mark inactive and start grace period.
    console.log(`Disconnect (${game.phase}) - ${player.name} marked inactive, 180s grace`);
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
      gracePeriod: 180
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
      // CRITICAL FIX: Look up by player name instead of socket.id, because
      // reconnection changes the player's id to the new socket.id
      const stillPlayer = stillThere.players.find(p => p.name === player.name);
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
        const playerIds = (stillThere.playerOrder || stillThere.players.filter(p => p.isActive).map(p => p.id)).filter(id => id !== null);
        const isQuestionTurn = stillThere.currentReaderIndex % 2 === 0;
        let expectedReaderId;
        if (isQuestionTurn) {
          expectedReaderId = playerIds[stillThere.currentReaderIndex / 2];
        } else {
          expectedReaderId = playerIds[((stillThere.currentReaderIndex + 1) / 2) % playerIds.length];
        }
        // CRITICAL FIX: Compare against stillPlayer.id (current id after potential reconnection)
        // instead of socket.id (old id from disconnect event)
        if (stillPlayer && expectedReaderId === stillPlayer.id) {
          console.log(`Active reader ${player.name} disconnected - advancing turn`);
          stillThere.currentReaderIndex++;
          setTimeout(() => startNextReading(roomCode), 300);
        }
      }
    }, 2000);

    // Set 180-second grace timeout for permanent removal
    player.reconnectTimeout = setTimeout(() => {
      const stillThere = games[roomCode];
      if (!stillThere) return;
      // CRITICAL FIX: Look up by player name instead of socket.id, because
      // reconnection changes the player's id to the new socket.id
      const stillDisconnected = stillThere.players.find(p => p.name === player.name && !p.isActive);
      if (!stillDisconnected) {
        console.log(`[grace-timeout] ${player.name} no longer matches a disconnected player - skipping`);
        return;
      }
      console.log(`[grace-timeout] Permanently removing ${stillDisconnected.name}`);
      // Tournament: mark player as left game in scores
      if (stillThere.tournament && stillThere.tournament.enabled && stillThere.tournament.scores[stillDisconnected.name]) {
        stillThere.tournament.scores[stillDisconnected.name].leftGame = true;
      }
      removePlayerFromGame(roomCode, stillDisconnected.id);

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
    }, 180000);
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
