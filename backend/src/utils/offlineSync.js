const db = require('../config/db');
const { cloudApiUrl, cloudSyncToken, deviceId, branchCode, isLocalOfflineMode, getRuntimeInfo } = require('./offlineConfig');

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

function toJsonb(value) {
  return JSON.stringify(value || {});
}

async function fetchOrderSnapshot(client, restaurantId, orderId) {
  const orderRes = await client.query(
    `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2`,
    [orderId, restaurantId]
  );
  if (!orderRes.rows.length) return null;

  const order = { ...orderRes.rows[0] };
  delete order.gl_entry_id;

  const itemsRes = await client.query(
    `SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at, id`,
    [orderId]
  );
  const adjustmentsRes = await client.query(
    `SELECT * FROM order_adjustments WHERE order_id=$1 ORDER BY created_at, id`,
    [orderId]
  );
  const adjustmentIds = adjustmentsRes.rows.map(row => row.id);
  const adjustmentItemsRes = adjustmentIds.length
    ? await client.query(
        `SELECT * FROM order_adjustment_items WHERE adjustment_id = ANY($1::uuid[]) ORDER BY id`,
        [adjustmentIds]
      )
    : { rows: [] };
  const tableRes = order.table_id
    ? await client.query(
        `SELECT id, status FROM dining_tables WHERE id=$1 AND restaurant_id=$2`,
        [order.table_id, restaurantId]
      )
    : { rows: [] };

  return {
    kind: 'order_snapshot',
    version: 1,
    createdAt: new Date().toISOString(),
    deviceId,
    branchCode,
    restaurantId,
    orderId,
    order,
    orderItems: itemsRes.rows,
    orderAdjustments: adjustmentsRes.rows,
    orderAdjustmentItems: adjustmentItemsRes.rows,
    table: tableRes.rows[0] || null,
  };
}

async function queueOrderSnapshot(restaurantId, orderId, operation = 'sync') {
  if (!isLocalOfflineMode) return null;

  const client = await db.getClient();
  try {
    const snapshot = await fetchOrderSnapshot(client, restaurantId, orderId);
    if (!snapshot) return null;
    const idempotencyKey = `order:${orderId}`;

    const result = await client.query(
      `INSERT INTO offline_sync_queue(
         restaurant_id, device_id, branch_code, entity_type, entity_id,
         operation, endpoint, method, payload, idempotency_key, status, attempts,
         last_error, queued_at, next_attempt_at, synced_at
       )
       VALUES($1,$2,$3,'order',$4,$5,'/api/sync/ingest','POST',$6::jsonb,$7,'pending',0,NULL,NOW(),NOW(),NULL)
       ON CONFLICT (idempotency_key) DO UPDATE SET
         restaurant_id = EXCLUDED.restaurant_id,
         device_id = EXCLUDED.device_id,
         branch_code = EXCLUDED.branch_code,
         entity_type = EXCLUDED.entity_type,
         entity_id = EXCLUDED.entity_id,
         operation = EXCLUDED.operation,
         endpoint = EXCLUDED.endpoint,
         method = EXCLUDED.method,
         payload = EXCLUDED.payload,
         status = 'pending',
         attempts = 0,
         last_error = NULL,
         queued_at = NOW(),
         next_attempt_at = NOW(),
         synced_at = NULL
       RETURNING id`,
      [restaurantId, deviceId, branchCode, orderId, operation, toJsonb(snapshot), idempotencyKey]
    );

    await client.query(
      `UPDATE orders
       SET sync_status='pending',
           sync_error=NULL,
           local_device_id=COALESCE(local_device_id, $2)
       WHERE id=$1`,
      [orderId, deviceId]
    ).catch(() => {});

    return result.rows[0];
  } catch (err) {
    console.warn('Queue order snapshot failed:', err.message);
    return null;
  } finally {
    client.release();
  }
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND is_generated='NEVER'
       AND is_identity='NO'
     ORDER BY ordinal_position`,
    [tableName]
  );
  return result.rows.map(row => row.column_name);
}

async function upsertRow(client, tableName, row, conflictColumn = 'id', excludeColumns = []) {
  if (!row || !row[conflictColumn]) return;
  const tableColumns = await getTableColumns(client, tableName);
  const excluded = new Set(excludeColumns);
  const columns = tableColumns.filter(column => Object.prototype.hasOwnProperty.call(row, column) && !excluded.has(column));
  if (!columns.length) return;

  const values = columns.map(column => {
    const value = row[column];
    if (value && typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
    return value;
  });
  const quotedColumns = columns.map(column => `"${column}"`).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updateColumns = columns.filter(column => column !== conflictColumn);
  const updateSql = updateColumns.length
    ? `DO UPDATE SET ${updateColumns.map(column => `"${column}"=EXCLUDED."${column}"`).join(', ')}`
    : 'DO NOTHING';

  await client.query(
    `INSERT INTO ${tableName} (${quotedColumns})
     VALUES (${placeholders})
     ON CONFLICT ("${conflictColumn}") ${updateSql}`,
    values
  );
}

async function applyOrderSnapshot(snapshot) {
  if (!snapshot || snapshot.kind !== 'order_snapshot' || !snapshot.order?.id) {
    const err = new Error('Invalid order snapshot payload');
    err.statusCode = 400;
    throw err;
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const orderRow = {
      ...snapshot.order,
      sync_status: 'synced',
      last_synced_at: new Date(),
      sync_error: null,
    };
    await upsertRow(client, 'orders', orderRow, 'id', ['gl_entry_id']);
    for (const item of snapshot.orderItems || []) {
      await upsertRow(client, 'order_items', item);
    }
    for (const adjustment of snapshot.orderAdjustments || []) {
      await upsertRow(client, 'order_adjustments', adjustment);
    }
    for (const item of snapshot.orderAdjustmentItems || []) {
      await upsertRow(client, 'order_adjustment_items', item);
    }
    if (snapshot.table?.id) {
      await client.query(
        `UPDATE dining_tables
         SET status=COALESCE($2, status)
         WHERE id=$1`,
        [snapshot.table.id, snapshot.table.status || null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
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

async function markQueueItemSynced(item) {
  await db.query(
    `UPDATE offline_sync_queue
     SET status='synced',
         synced_at=NOW(),
         last_error=NULL
     WHERE id=$1`,
    [item.id]
  );
  if (item.entity_type === 'order' && item.entity_id) {
    await db.query(
      `UPDATE orders
       SET sync_status='synced',
           last_synced_at=NOW(),
           sync_error=NULL
       WHERE id=$1`,
      [item.entity_id]
    ).catch(() => {});
  }
}

async function markQueueItemFailed(item, status, error) {
  await db.query(
    `UPDATE offline_sync_queue
     SET status=$2,
         last_error=$3,
         next_attempt_at=NOW() + INTERVAL '1 minute'
     WHERE id=$1`,
    [item.id, status, String(error || 'Sync failed').slice(0, 1000)]
  );
  if (item.entity_type === 'order' && item.entity_id) {
    await db.query(
      `UPDATE orders
       SET sync_status=$2,
           sync_error=$3
       WHERE id=$1`,
      [item.entity_id, status === 'conflict' ? 'conflict' : 'failed', String(error || 'Sync failed').slice(0, 1000)]
    ).catch(() => {});
  }
}

async function pushQueueItem(item) {
  if (!cloudApiUrl) throw new Error('CLOUD_API_URL is not configured');
  if (!cloudSyncToken) throw new Error('CLOUD_SYNC_TOKEN is not configured');
  if (typeof fetch !== 'function') throw new Error('Runtime fetch API is unavailable');

  const response = await fetch(`${cloudApiUrl}${item.endpoint || '/api/sync/ingest'}`, {
    method: item.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-RestaurantOS-Sync-Token': cloudSyncToken,
      'X-RestaurantOS-Device-Id': deviceId,
      'X-Idempotency-Key': item.idempotency_key,
    },
    body: JSON.stringify({
      idempotencyKey: item.idempotency_key,
      deviceId,
      branchCode,
      entityType: item.entity_type,
      entityId: item.entity_id,
      operation: item.operation,
      payload: item.payload,
    }),
  });

  if (!response.ok) {
    let message = `Cloud sync returned ${response.status}`;
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {}
    const err = new Error(message);
    err.statusCode = response.status;
    throw err;
  }

  return response.json().catch(() => ({}));
}

async function processPendingQueue(limit = 10) {
  if (!isLocalOfflineMode || !cloudApiUrl || !cloudSyncToken) return { processed: 0 };

  const { rows } = await db.query(
    `UPDATE offline_sync_queue q
     SET status='syncing',
         attempts=attempts + 1,
         last_error=NULL
     WHERE q.id IN (
       SELECT id
       FROM offline_sync_queue
       WHERE status IN ('pending','failed')
         AND COALESCE(next_attempt_at, queued_at) <= NOW()
       ORDER BY queued_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`,
    [limit]
  );

  for (const item of rows) {
    try {
      await pushQueueItem(item);
      await markQueueItemSynced(item);
    } catch (err) {
      await markQueueItemFailed(item, err.statusCode === 409 ? 'conflict' : 'failed', err.message);
    }
  }

  return { processed: rows.length };
}

function startOfflineSyncWorker() {
  if (!isLocalOfflineMode) return null;
  if (!cloudApiUrl) {
    console.log('Offline sync worker idle: CLOUD_API_URL is not configured');
    return null;
  }
  if (!cloudSyncToken) {
    console.log('Offline sync worker idle: CLOUD_SYNC_TOKEN is not configured');
    return null;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processPendingQueue();
    } catch (err) {
      console.warn('Offline sync worker error:', err.message);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, Number(process.env.SYNC_WORKER_INTERVAL_MS || 15000));
  tick();
  console.log('Offline sync worker started');
  return timer;
}

module.exports = {
  ensureOfflineSyncSchema,
  getSyncStatus,
  queueOrderSnapshot,
  applyOrderSnapshot,
  processPendingQueue,
  startOfflineSyncWorker,
  markFailedForRetry,
};
