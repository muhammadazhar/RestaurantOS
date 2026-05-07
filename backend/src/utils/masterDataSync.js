const db = require('../config/db');
const { branchCode, deviceId, isLocalOfflineMode } = require('./offlineConfig');
const { localizeMenuImages } = require('./offlineImageCache');

const MASTER_DATA_ENTITIES = {
  restaurant: {
    primaryTable: 'restaurants',
    restaurantColumn: 'id',
    children: [],
  },
  dining_table: {
    primaryTable: 'dining_tables',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  category: {
    primaryTable: 'categories',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  menu_item: {
    primaryTable: 'menu_items',
    restaurantColumn: 'restaurant_id',
    children: [
      { table: 'menu_item_variants', foreignColumn: 'menu_item_id' },
      { table: 'menu_item_addon_groups', foreignColumn: 'menu_item_id' },
      { table: 'menu_item_addons', parentTable: 'menu_item_addon_groups', parentColumn: 'addon_group_id' },
    ],
  },
  employee: {
    primaryTable: 'employees',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  role: {
    primaryTable: 'roles',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  discount_preset: {
    primaryTable: 'discount_presets',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  inventory_item: {
    primaryTable: 'inventory_items',
    restaurantColumn: 'restaurant_id',
    children: [],
  },
  recipe: {
    primaryTable: 'recipes',
    restaurantColumn: 'restaurant_id',
    children: [
      { table: 'recipe_ingredients', foreignColumn: 'recipe_id' },
    ],
  },
};

const MASTER_DATA_TABLES = [
  'restaurants',
  'dining_tables',
  'categories',
  'menu_items',
  'menu_item_variants',
  'menu_item_addon_groups',
  'menu_item_addons',
  'employees',
  'roles',
  'discount_presets',
  'inventory_items',
  'recipes',
  'recipe_ingredients',
];

const MASTER_ENTITY_PULL_ORDER = [
  'dining_table',
  'category',
  'role',
  'employee',
  'inventory_item',
  'menu_item',
  'discount_preset',
  'recipe',
];

const columnCache = new Map();

function toJsonb(value) {
  return JSON.stringify(value || {});
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema='public' AND table_name=$1
     ) AS exists`,
    [tableName]
  );
  return result.rows[0]?.exists === true;
}

async function getTableColumns(client, tableName) {
  if (columnCache.has(tableName)) return columnCache.get(tableName);
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
  const columns = result.rows.map(row => row.column_name);
  columnCache.set(tableName, columns);
  return columns;
}

async function hasColumn(client, tableName, columnName) {
  const columns = await getTableColumns(client, tableName);
  return columns.includes(columnName);
}

async function addMasterDataSyncMetadata(client) {
  for (const tableName of MASTER_DATA_TABLES) {
    if (!(await tableExists(client, tableName))) continue;
    await client.query(`
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
  columnCache.clear();
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

async function fetchPrimaryRow(client, config, restaurantId, entityId) {
  const where = config.restaurantColumn === 'id'
    ? 'id=$1'
    : 'id=$1 AND restaurant_id=$2';
  const params = config.restaurantColumn === 'id' ? [entityId] : [entityId, restaurantId];
  const result = await client.query(`SELECT * FROM ${config.primaryTable} WHERE ${where}`, params);
  return result.rows[0] || null;
}

async function fetchRowsByForeignKey(client, tableName, foreignColumn, entityId) {
  const orderColumn = await hasColumn(client, tableName, 'created_at') ? 'created_at NULLS LAST, id' : 'id';
  const result = await client.query(
    `SELECT * FROM ${tableName} WHERE ${foreignColumn}=$1 ORDER BY ${orderColumn}`,
    [entityId]
  );
  return result.rows;
}

async function fetchMenuAddonRows(client, menuItemId) {
  const result = await client.query(
    `SELECT a.*
     FROM menu_item_addons a
     JOIN menu_item_addon_groups g ON g.id = a.addon_group_id
     WHERE g.menu_item_id=$1
     ORDER BY a.created_at NULLS LAST, a.id`,
    [menuItemId]
  );
  return result.rows;
}

async function fetchEntitySnapshot(client, restaurantId, entityType, entityId, operation = 'sync') {
  const config = MASTER_DATA_ENTITIES[entityType];
  if (!config) throw new Error(`Unsupported master-data entity: ${entityType}`);
  const primary = await fetchPrimaryRow(client, config, restaurantId, entityId);
  const data = { [config.primaryTable]: primary ? [primary] : [] };

  if (primary) {
    for (const child of config.children) {
      data[child.table] = child.parentTable
        ? await fetchMenuAddonRows(client, entityId)
        : await fetchRowsByForeignKey(client, child.table, child.foreignColumn, entityId);
    }
  }

  return {
    kind: 'master_data_snapshot',
    version: 1,
    createdAt: new Date().toISOString(),
    deviceId,
    branchCode,
    restaurantId,
    entityType,
    entityId,
    operation,
    deleted: operation === 'delete' && !primary,
    data,
  };
}

async function markEntitySyncStatus(client, entityType, entityId, status, error = null) {
  const config = MASTER_DATA_ENTITIES[entityType];
  if (!config || !entityId) return;
  if (!(await hasColumn(client, config.primaryTable, 'sync_status'))) return;
  await client.query(
    `UPDATE ${config.primaryTable}
     SET sync_status=$2,
         sync_error=$3,
         local_device_id=COALESCE(local_device_id, $4)
     WHERE id=$1`,
    [entityId, status, error, deviceId]
  ).catch(() => {});
}

async function queueMasterDataSnapshot(restaurantId, entityType, entityId, operation = 'sync') {
  if (!isLocalOfflineMode || !restaurantId || !entityType || !entityId) return null;

  const client = await db.getClient();
  try {
    const snapshot = await fetchEntitySnapshot(client, restaurantId, entityType, entityId, operation);
    const idempotencyKey = `master:${entityType}:${entityId}`;

    const result = await client.query(
      `INSERT INTO offline_sync_queue(
         restaurant_id, device_id, branch_code, entity_type, entity_id,
         operation, endpoint, method, payload, idempotency_key, status, attempts,
         last_error, queued_at, next_attempt_at, synced_at
       )
       VALUES($1,$2,$3,$4,$5,$6,'/api/sync/ingest','POST',$7::jsonb,$8,'pending',0,NULL,NOW(),NOW(),NULL)
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
      [restaurantId, deviceId, branchCode, entityType, entityId, operation, toJsonb(snapshot), idempotencyKey]
    );

    await markEntitySyncStatus(client, entityType, entityId, 'pending');
    return result.rows[0];
  } catch (err) {
    console.warn('Queue master-data snapshot failed:', err.message);
    return null;
  } finally {
    client.release();
  }
}

async function hasPendingLocalMasterChange(client, entityType, entityId) {
  const result = await client.query(
    `SELECT 1
     FROM offline_sync_queue
     WHERE entity_type=$1
       AND entity_id=$2
       AND status IN ('pending','syncing','failed','conflict')
     LIMIT 1`,
    [entityType, entityId]
  );
  return result.rows.length > 0;
}

async function deleteEntity(client, entityType, restaurantId, entityId) {
  const config = MASTER_DATA_ENTITIES[entityType];
  if (!config) throw new Error(`Unsupported master-data entity: ${entityType}`);
  const restaurantWhere = config.restaurantColumn === 'id' ? '' : ' AND restaurant_id=$2';
  const params = config.restaurantColumn === 'id' ? [entityId] : [entityId, restaurantId];
  await client.query(`DELETE FROM ${config.primaryTable} WHERE id=$1${restaurantWhere}`, params);
}

async function replaceChildren(client, entityType, entityId, data) {
  if (entityType === 'menu_item') {
    await client.query(
      `DELETE FROM menu_item_addons
       WHERE addon_group_id IN (SELECT id FROM menu_item_addon_groups WHERE menu_item_id=$1)`,
      [entityId]
    );
    await client.query(`DELETE FROM menu_item_addon_groups WHERE menu_item_id=$1`, [entityId]);
    await client.query(`DELETE FROM menu_item_variants WHERE menu_item_id=$1`, [entityId]);
  } else if (entityType === 'recipe') {
    await client.query(`DELETE FROM recipe_ingredients WHERE recipe_id=$1`, [entityId]);
  }

  const childOrder = entityType === 'menu_item'
    ? ['menu_item_variants', 'menu_item_addon_groups', 'menu_item_addons']
    : entityType === 'recipe'
      ? ['recipe_ingredients']
      : [];
  for (const tableName of childOrder) {
    for (const row of data[tableName] || []) {
      await upsertRow(client, tableName, row);
    }
  }
}

async function applyMasterDataEntitySnapshot(snapshot, options = {}) {
  if (!snapshot || snapshot.kind !== 'master_data_snapshot' || !snapshot.entityType || !snapshot.entityId) {
    const err = new Error('Invalid master-data snapshot payload');
    err.statusCode = 400;
    throw err;
  }
  if (!MASTER_DATA_ENTITIES[snapshot.entityType]) {
    const err = new Error(`Unsupported master-data entity: ${snapshot.entityType}`);
    err.statusCode = 400;
    throw err;
  }

  const client = options.client || await db.getClient();
  const ownClient = !options.client;
  try {
    if (ownClient) await client.query('BEGIN');
    if (options.skipIfLocalPending && await hasPendingLocalMasterChange(client, snapshot.entityType, snapshot.entityId)) {
      if (ownClient) await client.query('COMMIT');
      return { skipped: true, reason: 'local_pending' };
    }

    if (snapshot.operation === 'delete' || snapshot.deleted) {
      await deleteEntity(client, snapshot.entityType, snapshot.restaurantId, snapshot.entityId);
    } else {
      const config = MASTER_DATA_ENTITIES[snapshot.entityType];
      const primaryRow = snapshot.data?.[config.primaryTable]?.[0];
      if (primaryRow) {
        await upsertRow(client, config.primaryTable, {
          ...primaryRow,
          sync_status: 'synced',
          sync_error: null,
          last_synced_at: new Date(),
        });
      }
      await replaceChildren(client, snapshot.entityType, snapshot.entityId, snapshot.data || {});
    }

    if (ownClient) await client.query('COMMIT');
    return { applied: true };
  } catch (err) {
    if (ownClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

function rowToEntitySnapshot(restaurantId, entityType, entityId, data) {
  return {
    kind: 'master_data_snapshot',
    version: 1,
    createdAt: new Date().toISOString(),
    restaurantId,
    entityType,
    entityId,
    operation: 'sync',
    data,
  };
}

async function buildMasterDataPullSnapshot(restaurantIds = []) {
  const client = await db.getClient();
  try {
    const ids = Array.isArray(restaurantIds) ? restaurantIds.filter(Boolean) : [];
    const restaurantFilter = ids.length ? 'WHERE id = ANY($1::uuid[])' : '';
    const params = ids.length ? [ids] : [];
    const restaurants = await client.query(`SELECT * FROM restaurants ${restaurantFilter} ORDER BY name`, params);
    const snapshots = [];

    for (const restaurant of restaurants.rows) {
      const restaurantId = restaurant.id;
      snapshots.push(rowToEntitySnapshot(restaurantId, 'restaurant', restaurantId, { restaurants: [restaurant] }));

      for (const entityType of MASTER_ENTITY_PULL_ORDER) {
        const config = MASTER_DATA_ENTITIES[entityType];
        const orderColumn = await hasColumn(client, config.primaryTable, 'created_at') ? 'created_at NULLS LAST, id' : 'id';
        const result = await client.query(
          `SELECT * FROM ${config.primaryTable}
           WHERE restaurant_id=$1
           ORDER BY ${orderColumn}`,
          [restaurantId]
        );
        for (const row of result.rows) {
          const snapshot = await fetchEntitySnapshot(client, restaurantId, entityType, row.id, 'sync');
          snapshots.push(snapshot);
        }
      }
    }

    return {
      kind: 'master_data_pull',
      version: 1,
      createdAt: new Date().toISOString(),
      snapshots,
    };
  } finally {
    client.release();
  }
}

async function getLocalRestaurantIds() {
  const result = await db.query(`SELECT id FROM restaurants WHERE status <> 'deleted' OR status IS NULL ORDER BY name`);
  return result.rows.map(row => row.id);
}

async function applyMasterDataPullSnapshot(payload) {
  if (!payload || payload.kind !== 'master_data_pull' || !Array.isArray(payload.snapshots)) {
    const err = new Error('Invalid master-data pull payload');
    err.statusCode = 400;
    throw err;
  }

  const client = await db.getClient();
  const stats = { applied: 0, skipped: 0 };
  try {
    await client.query('BEGIN');
    for (const snapshot of payload.snapshots) {
      const result = await applyMasterDataEntitySnapshot(snapshot, { client, skipIfLocalPending: true });
      if (result.skipped) stats.skipped += 1;
      else stats.applied += 1;
    }
    await client.query(
      `UPDATE offline_devices
       SET last_synced_at=NOW(), updated_at=NOW()
       WHERE device_id=$1`,
      [deviceId]
    ).catch(() => {});
    await client.query('COMMIT');
    localizeMenuImages().catch(err => console.warn('Offline image localization after master pull failed:', err.message));
    return stats;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  MASTER_DATA_TABLES,
  addMasterDataSyncMetadata,
  applyMasterDataEntitySnapshot,
  applyMasterDataPullSnapshot,
  buildMasterDataPullSnapshot,
  getLocalRestaurantIds,
  queueMasterDataSnapshot,
};
