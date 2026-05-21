const fs = require('fs');
const path = require('path');
require('../env')();

const source = path.resolve(__dirname, '..', process.env.DB_PATH || 'data.db');
const backupDir = path.resolve(__dirname, '..', 'backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `data-${stamp}.db`);

if (!fs.existsSync(source)) {
  console.error(`Database not found: ${source}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(JSON.stringify({ source, target }, null, 2));
