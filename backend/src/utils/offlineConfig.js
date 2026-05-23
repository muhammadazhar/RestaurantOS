const db = require('../config/db');

const normalizeMode = (value) => String(value || '').trim().toLowerCase();

const deploymentMode = normalizeMode(process.env.DEPLOYMENT_MODE || process.env.APP_MODE || 'cloud');
const isLocalOfflineMode = ['local_offline', 'offline', 'hybrid_local'].includes(deploymentMode);
const masterDataAuthority = normalizeMode(process.env.MASTER_DATA_AUTHORITY || 'local');
const isLocalMasterPrimary = masterDataAuthority === 'local';
const deviceId = process.env.DEVICE_ID || process.env.OFFLINE_DEVICE_ID || 'LOCAL-POS-01';
const branchCode = process.env.BRANCH_CODE || process.env.OFFLINE_BRANCH_CODE || null;
const cloudApiUrl = (process.env.CLOUD_API_URL || process.env.REMOTE_API_URL || '').replace(/\/+$/, '');
const cloudSyncToken = process.env.CLOUD_SYNC_TOKEN || process.env.SYNC_API_KEY || '';

function getRuntimeInfo() {
  return {
    deploymentMode,
    isLocalOfflineMode,
    masterDataAuthority,
    isLocalMasterPrimary,
    deviceId,
    branchCode,
    cloudApiUrl,
    syncTokenConfigured: Boolean(cloudSyncToken),
    database: db.dbInfo,
  };
}

module.exports = {
  deploymentMode,
  isLocalOfflineMode,
  masterDataAuthority,
  isLocalMasterPrimary,
  deviceId,
  branchCode,
  cloudApiUrl,
  cloudSyncToken,
  getRuntimeInfo,
};
