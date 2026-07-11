const { createClient } = require('@libsql/client');
const { DatabaseSync } = require('node:sqlite');

let client = null;
let localDb = null;
let lastInsertRowid = 0;

// Wrapper that mimics sql.js API ({ columns, values } shape) so server.js
// doesn't need to change its result-parsing patterns.
class DbWrapper {
  async run(sql, params = []) {
    if (localDb) {
      const stmt = localDb.prepare(sql);
      const result = stmt.run(...params);
      if (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null) {
        lastInsertRowid = Number(result.lastInsertRowid);
      }
      return;
    }
    const result = await client.execute({ sql, args: params });
    if (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null) {
      lastInsertRowid = Number(result.lastInsertRowid);
    }
  }

  async exec(sql, params = []) {
    if (localDb) {
      const stmt = localDb.prepare(sql);
      const rows = stmt.all(...params);
      if (sql.includes('last_insert_rowid()')) {
        return [{ columns: ['id'], values: [[lastInsertRowid]] }];
      }
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const values = (rows || []).map(row => columns.map(col => {
        const v = row[col];
        if (typeof v === 'bigint') return Number(v);
        return v;
      }));
      return [{ columns, values }];
    }
    const result = await client.execute({ sql, args: params });
    if (result.lastInsertRowid !== undefined && result.lastInsertRowid !== null) {
      lastInsertRowid = Number(result.lastInsertRowid);
    }
    // Handle "SELECT last_insert_rowid() as id" without hitting the DB
    if (sql.includes('last_insert_rowid()')) {
      return [{ columns: ['id'], values: [[lastInsertRowid]] }];
    }
    // Convert Turso rows (array of objects) to sql.js shape [{ columns, values }]
    const columns = result.columns || [];
    const rows = result.rows || [];
    const values = rows.map(row => columns.map(col => {
      const v = row[col];
      // Handle BigInt → Number for SQLite INTEGER columns
      if (typeof v === 'bigint') return Number(v);
      return v;
    }));
    return [{ columns, values }];
  }
}

// Initialize database
async function initDatabase() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (url) {
    client = createClient({ url, authToken });
  } else {
    console.warn('[database] TURSO_DATABASE_URL not set; using in-memory SQLite fallback for testing.');
    localDb = new DatabaseSync(':memory:');
  }

  const exec = async (sql) => {
    if (localDb) {
      localDb.exec(sql);
    } else {
      await client.execute(sql);
    }
  };

  // Create tables
  await exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_code TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      anonymous_mode BOOLEAN DEFAULT 0,
      hidden_from_best_of BOOLEAN DEFAULT 0
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      text TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      vote_count INTEGER DEFAULT 0,
      anonymous BOOLEAN DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      text TEXT NOT NULL,
      author_id TEXT,
      author_name TEXT,
      vote_count INTEGER DEFAULT 0,
      anonymous BOOLEAN DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id)
    )
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS qa_pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER,
      question_id INTEGER,
      answer_id INTEGER,
      vote_count INTEGER DEFAULT 0,
      anonymous BOOLEAN DEFAULT 0,
      FOREIGN KEY (game_id) REFERENCES games(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (answer_id) REFERENCES answers(id)
    )
  `);

  await exec(`
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

  // Add hidden column to qa_pairs for moderation
  try {
    await exec("ALTER TABLE qa_pairs ADD COLUMN hidden BOOLEAN DEFAULT 0");
  } catch (e) { /* already exists */ }
  try {
    await exec("ALTER TABLE questions ADD COLUMN hidden BOOLEAN DEFAULT 0");
  } catch (e) { /* already exists */ }
  try {
    await exec("ALTER TABLE answers ADD COLUMN hidden BOOLEAN DEFAULT 0");
  } catch (e) { /* already exists */ }

  // Add approval and NSFW flags to qa_pairs for content curation
  try {
    await exec("ALTER TABLE qa_pairs ADD COLUMN is_approved BOOLEAN DEFAULT 0");
  } catch (e) { /* already exists */ }
  try {
    await exec("ALTER TABLE qa_pairs ADD COLUMN is_nsfw BOOLEAN DEFAULT 0");
  } catch (e) { /* already exists */ }

  const db = new DbWrapper();
  return db;
}

// No-op — Turso persists automatically
function saveDatabase() {}

// Get database instance
function getDb() {
  if (!client && !localDb) throw new Error('Database not initialized. Call initDatabase() first.');
  return new DbWrapper();
}

module.exports = { initDatabase, getDb, saveDatabase };
