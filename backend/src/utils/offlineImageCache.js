const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const db = require('../config/db');
const { isLocalOfflineMode } = require('./offlineConfig');

const CACHE_ROUTE_PREFIX = '/uploads/offline-cache';
const CACHE_DIR = path.join(__dirname, '../../uploads/offline-cache');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

function extensionFromContentType(contentType) {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/png') return '.png';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/gif') return '.gif';
  if (type === 'image/avif') return '.avif';
  return null;
}

function extensionFromUrl(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) ? ext : null;
  } catch {
    return null;
  }
}

function cacheFilename(menuItemId, imageUrl, contentType) {
  const hash = crypto.createHash('sha256').update(imageUrl).digest('hex').slice(0, 16);
  const ext = extensionFromContentType(contentType) || extensionFromUrl(imageUrl) || '.jpg';
  return `${menuItemId}-${hash}${ext}`;
}

async function downloadImage(imageUrl, filePath) {
  if (typeof fetch !== 'function') throw new Error('Runtime fetch API is unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OFFLINE_IMAGE_FETCH_TIMEOUT_MS || 15000));
  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Image download returned ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`URL did not return an image (${contentType || 'unknown content type'})`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, bytes);
    return contentType;
  } finally {
    clearTimeout(timeout);
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function localizeOneMenuImage(row) {
  const imageUrl = String(row.image_url || '').trim();
  if (!imageUrl.startsWith('http')) return { skipped: true };

  await fs.mkdir(CACHE_DIR, { recursive: true });

  let contentType = null;
  let filename = cacheFilename(row.id, imageUrl, contentType);
  let filePath = path.join(CACHE_DIR, filename);

  if (!(await fileExists(filePath))) {
    const tempPath = `${filePath}.tmp`;
    try {
      contentType = await downloadImage(imageUrl, tempPath);
      filename = cacheFilename(row.id, imageUrl, contentType);
      filePath = path.join(CACHE_DIR, filename);
      if (await fileExists(filePath)) {
        await fs.rm(tempPath, { force: true });
      } else {
        await fs.rename(tempPath, filePath);
      }
    } catch (err) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  const localUrl = `${CACHE_ROUTE_PREFIX}/${filename}`;
  await db.query(
    `UPDATE menu_items
     SET image_url=$1
     WHERE id=$2
       AND image_url=$3`,
    [localUrl, row.id, imageUrl]
  );
  return { localized: true, localUrl };
}

async function localizeMenuImages(options = {}) {
  if (!isLocalOfflineMode && !options.force) {
    return { skipped: true, reason: 'not_local_offline_mode' };
  }

  const limit = Number(options.limit || process.env.OFFLINE_IMAGE_CACHE_LIMIT || 500);
  const result = await db.query(
    `SELECT id, image_url
     FROM menu_items
     WHERE image_url LIKE 'http%'
       AND COALESCE(is_deleted, FALSE)=FALSE
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
     LIMIT $1`,
    [limit]
  );

  const stats = { checked: result.rows.length, localized: 0, failed: 0, skipped: 0, errors: [] };
  for (const row of result.rows) {
    try {
      const item = await localizeOneMenuImage(row);
      if (item.localized) stats.localized += 1;
      else stats.skipped += 1;
    } catch (err) {
      stats.failed += 1;
      if (stats.errors.length < 5) stats.errors.push({ id: row.id, error: err.message });
    }
  }

  return stats;
}

function startOfflineImageLocalization() {
  if (!isLocalOfflineMode) return;
  localizeMenuImages()
    .then(stats => {
      if (stats.checked || stats.localized || stats.failed) {
        console.log(`Offline image cache: checked ${stats.checked}, localized ${stats.localized}, failed ${stats.failed}`);
      }
    })
    .catch(err => console.warn('Offline image cache skipped:', err.message));
}

module.exports = {
  localizeMenuImages,
  startOfflineImageLocalization,
};
