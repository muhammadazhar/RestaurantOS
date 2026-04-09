const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');
const os   = require('os');
const db   = require('../config/db');

const BACKUP_DIR = path.join(__dirname, '../../backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ── GET /api/system/health ────────────────────────────────────────────────────
exports.getHealth = async (req, res) => {
  try {
    const dbStart = Date.now();
    const dbResult = await db.query('SELECT NOW() as now, version() as version');
    const dbLatency = Date.now() - dbStart;

    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const cpus     = os.cpus();

    // Count backup files
    let backupCount = 0;
    let backupDirSize = 0;
    try {
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.sql'));
      backupCount = files.length;
      backupDirSize = files.reduce((sum, f) => {
        try { return sum + fs.statSync(path.join(BACKUP_DIR, f)).size; } catch { return sum; }
      }, 0);
    } catch { /* ignore */ }

    // CPU usage snapshot (load average on unix; approx on windows)
    const loadAvg = os.loadavg();

    res.json({
      status:       'healthy',
      uptime:       process.uptime(),
      nodeVersion:  process.version,
      platform:     process.platform,
      arch:         process.arch,
      hostname:     os.hostname(),
      memory: {
        total:       totalMem,
        used:        usedMem,
        free:        freeMem,
        usedPercent: Math.round((usedMem / totalMem) * 100),
      },
      cpu: {
        model:   cpus[0]?.model || 'Unknown',
        cores:   cpus.length,
        loadAvg: loadAvg.map(v => Math.round(v * 100) / 100),
      },
      database: {
        status:    'connected',
        latency:   dbLatency,
        version:   dbResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'PostgreSQL',
        serverTime: dbResult.rows[0]?.now,
      },
      backups: {
        dir:   BACKUP_DIR,
        count: backupCount,
        size:  backupDirSize,
      },
    });
  } catch (err) {
    console.error('Health check error:', err);
    res.json({
      status:     'degraded',
      uptime:     process.uptime(),
      nodeVersion: process.version,
      platform:   process.platform,
      arch:       process.arch,
      hostname:   os.hostname(),
      memory: {
        total:       os.totalmem(),
        used:        os.totalmem() - os.freemem(),
        free:        os.freemem(),
        usedPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
      },
      cpu: {
        model: os.cpus()[0]?.model || 'Unknown',
        cores: os.cpus().length,
        loadAvg: os.loadavg(),
      },
      database: { status: 'error', error: err.message, latency: null },
      backups:  { dir: BACKUP_DIR, count: 0, size: 0 },
    });
  }
};

// ── GET /api/system/backups ───────────────────────────────────────────────────
exports.listBackups = (req, res) => {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { name: f, size: stat.size, createdAt: stat.mtime };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not list backups' });
  }
};

// ── POST /api/system/backup ───────────────────────────────────────────────────
exports.createBackup = (req, res) => {
  const { DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, POSTGRES_CONTAINER } = process.env;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `restaurantos_backup_${timestamp}.sql`;
  const filepath  = path.join(BACKUP_DIR, filename);

  const name = DB_NAME || 'restaurantos';
  const user = DB_USER || 'postgres';

  // Choose strategy: Docker exec (preferred) or native pg_dump
  let child;
  if (POSTGRES_CONTAINER) {
    // pg_dump runs inside the container — no host PATH or PGPASSWORD needed
    child = spawn('docker', [
      'exec', POSTGRES_CONTAINER,
      'pg_dump', '-U', user, '-d', name, '--no-password',
    ]);
  } else {
    // Native pg_dump — must be in system PATH
    child = spawn('pg_dump', [
      '-h', DB_HOST || 'localhost',
      '-p', DB_PORT || '5432',
      '-U', user,
      '-d', name,
      '--no-password',
    ], {
      env: { ...process.env, PGPASSWORD: DB_PASSWORD || '' },
    });
  }

  const writeStream = fs.createWriteStream(filepath);
  let errorOutput = '';

  child.stdout.pipe(writeStream);
  child.stderr.on('data', chunk => { errorOutput += chunk.toString(); });

  child.on('error', (err) => {
    writeStream.destroy();
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
    const hint = POSTGRES_CONTAINER
      ? 'Ensure Docker is running and the container name in .env is correct.'
      : 'Ensure pg_dump is installed and in your system PATH, or set POSTGRES_CONTAINER in .env.';
    res.status(500).json({ error: `Backup failed: ${err.message}. ${hint}` });
  });

  child.on('close', (code) => {
    writeStream.close(() => {
      if (code !== 0) {
        try { fs.unlinkSync(filepath); } catch { /* ignore */ }
        return res.status(500).json({ error: `pg_dump exited with code ${code}: ${errorOutput}` });
      }
      let size = 0;
      try { size = fs.statSync(filepath).size; } catch { /* ignore */ }
      res.json({ success: true, filename, size, path: filepath });
    });
  });
};

// ── GET /api/system/backups/:filename (download) ──────────────────────────────
exports.downloadBackup = (req, res) => {
  const { filename } = req.params;

  // Prevent path traversal
  if (!filename || filename.includes('..') || /[/\\]/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  res.download(filepath, filename);
};

// ── DELETE /api/system/backups/:filename ──────────────────────────────────────
exports.deleteBackup = (req, res) => {
  const { filename } = req.params;

  if (!filename || filename.includes('..') || /[/\\]/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Backup file not found' });
  }

  try {
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete backup file' });
  }
};
