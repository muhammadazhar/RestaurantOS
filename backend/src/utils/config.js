const db = require('../config/db');

exports.getConfig = async (key, envVar) => {
  try {
    const r = await db.query('SELECT value FROM system_config WHERE key=$1', [key]);
    if (r.rows.length && r.rows[0].value != null) return r.rows[0].value;
  } catch {}
  return process.env[envVar] || null;
};

exports.setConfig = async (key, value) => {
  await db.query(
    `INSERT INTO system_config(key, value, updated_at) VALUES($1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [key, String(value)]
  );
};
