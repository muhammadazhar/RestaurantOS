const db = require('../config/db');
const { cloudApiUrl, deviceId, branchCode, getRuntimeInfo } = require('./offlineConfig');

const OFFLINE_WRITE_TABLES = [
  'orders',
  'order_items',
  'order_adjustments',
  'order_adjustment_items',
  'shifts',
  'shift_sessions',
  'dining_tables',
  'inventory_transactions',
  'attendance_logs',
  'rider_collections',
];

async function tableExists(tableName) {
  const result = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName]
  );
  return result.rows[0]?.exists === true;
}

async function ensureOfflineSyncSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS offline_devices (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id      TEXT NOT NULL UNIQUE,
      branch_code    TEXT,
      label          TEXT,
      status         TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive','retired')),
      last_seen_at   TIMESTAMPTZ,
      last_synced_at TIMESTAMPTZ,
      metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS offline_sync_queue (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID REFERENCES restaurants(id) ON DELETE CASCADE,
      device_id        TEXT NOT NULL,
      branch_code      TEXT,
      entity_type      TEXT NOT NULL,
      entity_id        UUID,
      operation        TEXT NOT NULL
                       CHECK (operation IN ('create','update','delete','status','payment','return','replace','sync')),
      endpoint         TEXT,
      method           TEXT,
      payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
      idempotency_key  TEXT NOT NULL UNIQUE,
      status           TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','syncing','synced','failed','conflict','ignored')),
      attempts         INT NOT NULL DEFAULT 0,
      last_error       TEXT,
      queued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      next_attempt_at  TIMESTAMPTZ,
      synced_at        TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_status
      ON offline_sync_queue(status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_restaurant
      ON offline_sync_queue(restaurant_id, status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_device
      ON offline_sync_queue(device_id, status, queued_at);
  `);

  await db.query(
    `INSERT INTO offline_devices(device_id, branch_code, label, last_seen_at, metadata)
     VALUES($1, $2, $3, NOW(), $4::jsonb)
     ON CONFLICT (device_id) DO UPDATE SET
       branch_code = EXCLUDED.branch_code,
       label = EXCLUDED.label,
       metadata = EXCLUDED.metadata,
       last_seen_at = NOW(),
       updated_at = NOW()`,
    [
      deviceId,
      branchCode,
      process.env.DEVICE_LABEL || deviceId,
      JSON.stringify({ runtime: getRuntimeInfo() }),
    ]
  );

  for (const tableName of OFFLINE_WRITE_TABLES) {
    if (!(await tableExists(tableName))) continue;
    await db.query(`
      ALTER TABLE ${tableName}
        ADD COLUMN IF NOT EXISTS local_device_id TEXT,
        ADD COLUMN IF NOT EXISTS local_id TEXT,
        ADD COLUMN IF NOT EXISTS cloud_id UUID,
        ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'synced'
          CHECK (sync_status IN ('local_only','pending','syncing','synced','failed','conflict')),
        ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS sync_error TEXT;

      CREATE INDEX IF NOT EXISTS idx_${tableName}_sync_status
        ON ${tableName}(sync_status);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_local_device_id
        ON ${tableName}(local_device_id);
    `);
  }
}

async function getQueueSummary() {
  const result = await db.query(`
    SELECT status, COUNT(*)::int AS count
    FROM offline_sync_queue
    GROUP BY status
  `);
  const counts = {
    pending: 0,
    syncing: 0,
    synced: 0,
    failed: 0,
    conflict: 0,
    ignored: 0,
  };
  result.rows.forEach(row => {
    counts[row.status] = Number(row.count || 0);
  });
  return {
    ...counts,
    outstanding: counts.pending + counts.syncing + counts.failed + counts.conflict,
  };
}

async function getLastSyncAt() {
  const result = await db.query(`
    SELECT MAX(synced_at) AS last_synced_at
    FROM offline_sync_queue
    WHERE status = 'synced'
  `);
  return result.rows[0]?.last_synced_at || null;
}

async function checkCloudReachability() {
  if (!cloudApiUrl) {
    return { configured: false, online: false, url: null, error: 'CLOUD_API_URL is not configured' };
  }
  if (typeof fetch !== 'function') {
    return { configured: true, online: false, url: cloudApiUrl, error: 'Runtime fetch API is unavailable' };
  }

  const healthUrl = `${cloudApiUrl}/api/health`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    return {
      configured: true,
      online: response.ok,
      url: cloudApiUrl,
      status: response.status,
      error: response.ok ? null : `Cloud health returned ${response.status}`,
    };
  } catch (err) {
    return {
      configured: true,
      online: false,
      url: cloudApiUrl,
      error: err.name === 'AbortError' ? 'Cloud health check timed out' : err.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getSyncStatus() {
  const [queue, cloud, lastSyncedAt] = await Promise.all([
    getQueueSummary(),
    checkCloudReachability(),
    getLastSyncAt(),
  ]);

  return {
    runtime: getRuntimeInfo(),
    cloud,
    queue,
    lastSyncedAt,
    serverTime: new Date().toISOString(),
  };
}

async function markFailedForRetry() {
  const result = await db.query(`
    UPDATE offline_sync_queue
    SET status = 'pending',
        next_attempt_at = NOW(),
        last_error = NULL
    WHERE status = 'failed'
    RETURNING id
  `);
  return result.rowCount;
}

module.exports = {
  ensureOfflineSyncSchema,
  getSyncStatus,
  markFailedForRetry,
};
