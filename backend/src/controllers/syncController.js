const { getSyncStatus, markFailedForRetry } = require('../utils/offlineSync');

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
    res.json({ success: true, queued });
  } catch (err) {
    console.error('Sync retry error:', err);
    res.status(500).json({ error: 'Unable to retry failed sync items' });
  }
};
