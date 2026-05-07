const { cloudSyncToken } = require('../utils/offlineConfig');
const { applyOrderSnapshot, getSyncStatus, markFailedForRetry, processPendingQueue } = require('../utils/offlineSync');

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

    return res.status(400).json({ error: 'Unsupported sync payload kind' });
  } catch (err) {
    console.error('Sync ingest error:', err.message, err.detail || '');
    res.status(err.statusCode || 500).json({ error: err.message || 'Unable to ingest sync payload' });
  }
};
