const { Pool } = require('pg');
require('dotenv').config();

const mode = (process.env.DB_MODE || 'local').toLowerCase();

let pool;

// Use Neon if DATABASE_URL is set (auto-detected on Railway) or DB_MODE=neon
if (process.env.DATABASE_URL || mode === 'neon') {
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
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

pool.on('error', (err) => {
  console.error('Unexpected DB pool error', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
