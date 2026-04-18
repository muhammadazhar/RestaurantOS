const { Pool } = require('pg');
require('dotenv').config();

const explicitMode = process.env.DB_MODE?.toLowerCase();
const mode = explicitMode || (process.env.DATABASE_URL ? 'neon' : 'local');

let pool;

// DB_MODE=local always wins, which keeps local development off Neon even if a
// DATABASE_URL exists in the shell. Railway can still auto-use DATABASE_URL
// when DB_MODE is not set.
if (mode === 'neon') {
  if (!process.env.DATABASE_URL) {
    throw new Error('DB_MODE=neon requires DATABASE_URL');
  }
  console.log('🌩  Database: Neon (cloud)');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
} else {
  console.log('🖥  Database: Local PostgreSQL');
  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME     || 'restaurantos',
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    options: '-c search_path=public',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

async function prepareClient(client) {
  if (!client.__restaurantosSearchPathReady) {
    await client.query('SET search_path TO public');
    client.__restaurantosSearchPathReady = true;
  }
  return client;
}

module.exports = {
  query: async (text, params) => {
    const client = await pool.connect();
    try {
      await prepareClient(client);
      return await client.query(text, params);
    } finally {
      client.release();
    }
  },
  getClient: async () => {
    const client = await pool.connect();
    try {
      return await prepareClient(client);
    } catch (err) {
      client.release();
      throw err;
    }
  },
  pool,
};
