require('./env')();

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

  CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_user_id INTEGER NOT NULL REFERENCES users(id),
    game_type TEXT NOT NULL,
    title TEXT NOT NULL,
    city TEXT NOT NULL,
    area TEXT,
    address TEXT,
    location_lng REAL,
    location_lat REAL,
    play_date TEXT NOT NULL,
    play_time TEXT NOT NULL,
    min_players INTEGER NOT NULL DEFAULT 2,
    max_players INTEGER NOT NULL DEFAULT 6,
    current_players INTEGER NOT NULL DEFAULT 1,
    tags TEXT DEFAULT '[]',
    note TEXT,
    contact_note TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_game_sessions_creator ON game_sessions(creator_user_id);
  CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status);
  CREATE INDEX IF NOT EXISTS idx_game_sessions_city ON game_sessions(city);
  CREATE INDEX IF NOT EXISTS idx_game_sessions_game_type ON game_sessions(game_type);
  CREATE INDEX IF NOT EXISTS idx_game_sessions_play_time ON game_sessions(play_date, play_time);

  CREATE TABLE IF NOT EXISTS session_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    certainty TEXT DEFAULT 'confirmed',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_requests_session ON session_requests(session_id);
  CREATE INDEX IF NOT EXISTS idx_session_requests_user ON session_requests(user_id);
  CREATE INDEX IF NOT EXISTS idx_session_requests_status ON session_requests(status);

  CREATE TABLE IF NOT EXISTS user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(blocker_user_id, blocked_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_user_id);
  CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_user_id);

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    detail TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_user_id);
  CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_user_id);

  CREATE TABLE IF NOT EXISTS session_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    punctual INTEGER NOT NULL DEFAULT 0,
    friendly INTEGER NOT NULL DEFAULT 0,
    would_play_again INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(session_id, from_user_id, to_user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_session_feedback_to ON session_feedback(to_user_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    read_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);

  CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    feature TEXT NOT NULL,
    input_hash TEXT,
    output_status TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    latency_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature ON ai_usage_logs(feature, created_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('profiles', 'availability', "TEXT DEFAULT '[]'");
ensureColumn('profiles', 'budget_range', 'TEXT');
ensureColumn('profiles', 'player_count_range', 'TEXT');
ensureColumn('profiles', 'play_modes', "TEXT DEFAULT '[]'");

ensureColumn('users', 'mp_openid', 'TEXT');
ensureColumn('users', 'mp_unionid', 'TEXT');
ensureColumn('users', 'mp_session_key', 'TEXT');
ensureColumn('users', 'mp_last_login_at', 'TEXT');
ensureColumn('users', 'notify_request_updates', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'notify_review_results', 'INTEGER NOT NULL DEFAULT 1');
ensureColumn('users', 'notify_session_status', 'INTEGER NOT NULL DEFAULT 1');

ensureColumn('game_sessions', 'budget_range', 'TEXT');
ensureColumn('game_sessions', 'play_mode', "TEXT NOT NULL DEFAULT '线下'");
ensureColumn('game_sessions', 'address', 'TEXT');
ensureColumn('game_sessions', 'location_lng', 'REAL');
ensureColumn('game_sessions', 'location_lat', 'REAL');

ensureColumn('session_requests', 'certainty', "TEXT DEFAULT 'confirmed'");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mp_openid ON users(mp_openid) WHERE mp_openid IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_users_mp_unionid ON users(mp_unionid);
`);

module.exports = db;
