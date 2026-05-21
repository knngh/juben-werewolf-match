const db = require('../db');

const today = new Date().toISOString().slice(0, 10);
const result = db.prepare(`
  UPDATE game_sessions
  SET status = 'closed', updated_at = datetime('now')
  WHERE status = 'open' AND play_date < ?
`).run(today);

console.log(JSON.stringify({ closed: result.changes, before: today }, null, 2));
