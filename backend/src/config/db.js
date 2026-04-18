const { Pool } = require('pg');
require('dotenv').config();

const explicitMode = process.env.DB_MODE?.toLowerCase();
const cloudDatabaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const mode = explicitMode || (cloudDatabaseUrl ? 'neon' : 'local');

let pool;
let dbInfo = { mode, host: 'localhost', database: process.env.DB_NAME || 'restaurantos' };

function parseDatabaseInfo(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return {
      mode,
      host: parsed.hostname,
      database: parsed.pathname.replace(/^\//, '') || null,
      source: process.env.NEON_DATABASE_URL ? 'NEON_DATABASE_URL' : 'DATABASE_URL',
    };
  } catch {
    return { mode, host: 'unknown', database: null, source: 'invalid-url' };
  }
}

function isNeonHost(host) {
  return typeof host === 'string' && host.endsWith('.neon.tech');
}

// DB_MODE=local always wins, which keeps local development off Neon even if a
// DATABASE_URL exists in the shell. Railway should set NEON_DATABASE_URL for an
// explicit Neon connection; DATABASE_URL remains a fallback for existing setups.
if (mode === 'neon') {
  if (!cloudDatabaseUrl) {
    throw new Error('DB_MODE=neon requires NEON_DATABASE_URL or DATABASE_URL');
  }
  console.log('🌩  Database: Neon (cloud)');
  dbInfo = parseDatabaseInfo(cloudDatabaseUrl);
  if (process.env.NODE_ENV === 'production' && !isNeonHost(dbInfo.host)) {
    throw new Error(`DB_MODE=neon requires a Neon host in production, received ${dbInfo.host} from ${dbInfo.source}`);
  }
  console.log(`Database host: ${dbInfo.host}/${dbInfo.database || ''} via ${dbInfo.source}`);
  pool = new Pool({
    connectionString: cloudDatabaseUrl,
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
  dbInfo,
};
