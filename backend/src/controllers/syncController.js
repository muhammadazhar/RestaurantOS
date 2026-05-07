const { cloudSyncToken } = require('../utils/offlineConfig');
const { applyAttendanceLogSnapshot, applyMasterDataEntitySnapshot, applyOrderSnapshot, applyShiftSessionSnapshot, getSyncStatus, markFailedForRetry, processPendingQueue } = require('../utils/offlineSync');
const { buildMasterDataPullSnapshot } = require('../utils/masterDataSync');

exports.getStatus = async (_req, res) => {
  try {
    res.json(await getSyncStatus());
  } catch (err) {
    console.error('Sync status error:', err);
    res.status(500).json({ error: 'Unable to load sync status' });
  }
};

exports.retryFailed = async (_req, res) => {
  try {
    const queued = await markFailedForRetry();
    processPendingQueue().catch(err => console.warn('Manual sync retry worker error:', err.message));
    res.json({ success: true, queued });
  } catch (err) {
    console.error('Sync retry error:', err);
    res.status(500).json({ error: 'Unable to retry failed sync items' });
  }
};

exports.ingest = async (req, res) => {
  try {
    const token = req.headers['x-restaurantos-sync-token'];
    if (!cloudSyncToken || token !== cloudSyncToken) {
      return res.status(401).json({ error: 'Invalid sync token' });
    }

    const { payload } = req.body || {};
    if (!payload) return res.status(400).json({ error: 'Missing sync payload' });

    if (payload.kind === 'order_snapshot') {
      await applyOrderSnapshot(payload);
      return res.json({ success: true, applied: 'order_snapshot', orderId: payload.orderId });
    }

    if (payload.kind === 'shift_session_snapshot') {
      await applyShiftSessionSnapshot(payload);
      return res.json({ success: true, applied: 'shift_session_snapshot', sessionId: payload.sessionId });
    }

    if (payload.kind === 'attendance_log_snapshot') {
      await applyAttendanceLogSnapshot(payload);
      return res.json({ success: true, applied: 'attendance_log_snapshot', logId: payload.logId });
    }

    if (payload.kind === 'master_data_snapshot') {
      await applyMasterDataEntitySnapshot(payload);
      return res.json({
        success: true,
        applied: 'master_data_snapshot',
        entityType: payload.entityType,
        entityId: payload.entityId,
      });
    }

    return res.status(400).json({ error: 'Unsupported sync payload kind' });
  } catch (err) {
    console.error('Sync ingest error:', err.message, err.detail || '');
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to ingest sync payload' });
  }
};

exports.getMasterData = async (req, res) => {
  try {
    const token = req.headers['x-restaurantos-sync-token'];
    if (!cloudSyncToken || token !== cloudSyncToken) {
      return res.status(401).json({ error: 'Invalid sync token' });
    }

    const restaurantIds = Array.isArray(req.body?.restaurantIds) ? req.body.restaurantIds : [];
    res.json(await buildMasterDataPullSnapshot(restaurantIds));
  } catch (err) {
    console.error('Sync master-data pull error:', err.message, err.detail || '');
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to build master-data snapshot' });
  }
};
