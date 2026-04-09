const fs   = require('fs');
const path = require('path');
const db   = require('./db');

async function migrate() {
  const migrationsDir = path.join(__dirname, '../../../database/migrations');
  const files = fs.readdirSync(migrationsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.query(sql);
    console.log(`✓ ${file} done`);
  }
  console.log('All migrations complete.');
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
