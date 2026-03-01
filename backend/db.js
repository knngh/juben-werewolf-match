const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE,
    wechat TEXT,
    password_hash TEXT NOT NULL,
    nickname TEXT NOT NULL,
    avatar TEXT,
    gender INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat ON users(wechat) WHERE wechat IS NOT NULL;

  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    game_types TEXT DEFAULT '[]',
    play_styles TEXT DEFAULT '[]',
    preferred_roles TEXT DEFAULT '[]',
    play_freq TEXT,
    intro TEXT,
    city TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(from_user_id, to_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_likes_from ON likes(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_likes_to ON likes(to_user_id);
`);

module.exports = db;
