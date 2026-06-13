const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'what-if-game.db');
let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  let dbBuffer;
  if (fs.existsSync(dbPath)) {
    dbBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(dbBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  db.run("PRAGMA foreign_keys = ON");

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      anonymous_mode BOOLEAN DEFAULT 0,
      hidden_from_best_of BOOLEAN DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      text TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      vote_count INTEGER DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      text TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      vote_count INTEGER DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS qa_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      question_id INTEGER,
      answer_id INTEGER,
      vote_count INTEGER DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (answer_id) REFERENCES answers(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      player_id TEXT,
      vote_type TEXT,
      target_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(player_id, vote_type, target_id)
    )
  `);

  // Add anonymous column to ensure per-round/per-item anonymity persists correctly
  try {
    db.run("ALTER TABLE questions ADD COLUMN anonymous BOOLEAN DEFAULT 0");
  } catch (e) {
    // Already exists or table not initialized
  }
  try {
    db.run("ALTER TABLE answers ADD COLUMN anonymous BOOLEAN DEFAULT 0");
  } catch (e) {
    // Already exists or table not initialized
  }
  try {
    db.run("ALTER TABLE qa_pairs ADD COLUMN anonymous BOOLEAN DEFAULT 0");
  } catch (e) {
    // Already exists or table not initialized
  }

  // Save database
  saveDatabase();
  
  return db;
}

// Save database to file
function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Get database instance
function getDb() {
  return db;
}

module.exports = { initDatabase, getDb, saveDatabase };
