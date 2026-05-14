const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

const root = path.join(__dirname, '../..');
const migrationDir = path.join(root, 'database/migrations');
const seedDir = path.join(root, 'database/seeds');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDatabase() {
  const maxAttempts = Number(process.env.DB_INIT_MAX_ATTEMPTS || 60);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`Database not ready yet (${attempt}/${maxAttempts}): ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Database did not become ready in time');
}

async function hasExistingSchema() {
  const result = await db.query("SELECT to_regclass('public.restaurants') AS restaurants");
  return Boolean(result.rows[0]?.restaurants);
}

async function applySqlDirectory(dir, label) {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sqlPath = path.join(dir, file);
    console.log(`Applying ${label}: ${file}`);
    await db.query(fs.readFileSync(sqlPath, 'utf8'));
  }
}

async function main() {
  await waitForDatabase();

  if (await hasExistingSchema()) {
    console.log('RestaurantOS schema already exists. Skipping first-time initialization.');
    await db.pool.end();
    return;
  }

  await applySqlDirectory(migrationDir, 'migration');

  if (process.env.RUN_SEED_DATA !== 'false') {
    await applySqlDirectory(seedDir, 'seed');
  }

  console.log('On-premise database initialization complete.');
  await db.pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.pool.end();
  } catch {}
  process.exit(1);
});
