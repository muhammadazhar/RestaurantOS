const fs   = require('fs');
const path = require('path');
const db   = require('./db');

async function seed() {
  const seedsDir = path.join(__dirname, '../../../database/seeds');
  const files = fs.readdirSync(seedsDir).sort();
  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    console.log(`Running seed: ${file}`);
    const sql = fs.readFileSync(path.join(seedsDir, file), 'utf8');
    await db.query(sql);
    console.log(`✓ ${file} done`);
  }
  console.log('All seeds complete.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
