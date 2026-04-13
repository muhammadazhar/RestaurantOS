require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const routes = require('./routes');
const db     = require('./config/db');
const fs     = require('fs');

// Ensure uploads directory exists
const uploadsDir = require('path').join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', methods: ['GET','POST'] }
});

// Trust proxy headers (fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR with express-rate-limit)
app.set('trust proxy', 1);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
// Allow cross-origin loading of uploaded images (frontend at :3000 fetches from :5000)
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many auth requests' }));
app.use('/api',      rateLimit({ windowMs: 60 * 1000, max: 300 }));

// Make io available in controllers
app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', routes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join_restaurant', (restaurantId) => {
    socket.join(restaurantId);
    console.log(`Socket ${socket.id} joined restaurant ${restaurantId}`);
  });

  socket.on('kitchen_update', (data) => {
    io.to(data.restaurantId).emit('order_updated', data);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

db.query('SELECT NOW()').then(async () => {
  console.log('✓ Database connected');
  // Add order-timing columns (idempotent — safe to run every startup)
  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS preparing_at  TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at      TIMESTAMPTZ;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at     TIMESTAMPTZ;
  `).catch(e => console.warn('Migration note:', e.message));

  // Migration 006: delivery columns (idempotent)
  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id      UUID REFERENCES shifts(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat  DECIMAL(10,7) DEFAULT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng  DECIMAL(10,7) DEFAULT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_id      UUID REFERENCES employees(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_at     TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS assignment_expires_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pickup_timeout_minutes INT NOT NULL DEFAULT 10;
  `).catch(e => console.warn('Migration 006 note:', e.message));

  // Migration: ensure every restaurant has a Rider role with rider permission
  await db.query(`
    INSERT INTO roles (restaurant_id, name, permissions, is_system)
    SELECT r.id, 'Rider', '["rider","alerts"]', false
    FROM restaurants r
    WHERE NOT EXISTS (
      SELECT 1 FROM roles ro WHERE ro.restaurant_id = r.id AND ro.name = 'Rider'
    )
  `).catch(e => console.warn('Rider role migration:', e.message));

  // Update status CHECK to include delivery statuses (idempotent)
  await db.query(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN (
        'pending','confirmed','preparing','ready','served','paid','cancelled',
        'picked','out_for_delivery','delivered'
      ));
  `).catch(e => console.warn('Status constraint note:', e.message));

  // Migration 007: extend incentive payment statuses + add received_at/updated_at
  await db.query(`
    ALTER TABLE rider_incentive_payments
      DROP CONSTRAINT IF EXISTS rider_incentive_payments_status_check;
    ALTER TABLE rider_incentive_payments
      ADD CONSTRAINT rider_incentive_payments_status_check
        CHECK (status IN ('pending','approved','paid','rejected','received'));
    ALTER TABLE rider_incentive_payments
      ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE rider_incentive_payments
      ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT NOW();
  `).catch(e => console.warn('Migration 007 note:', e.message));

  // Migration 008: ensure shifts.updated_at exists
  await db.query(`
    ALTER TABLE shifts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  `).catch(e => console.warn('Migration 008 note:', e.message));

  server.listen(PORT, () => {
    console.log(`✓ RestaurantOS API running on http://localhost:${PORT}`);
    console.log(`✓ WebSocket ready`);
  });
}).catch(err => {
  console.error('✗ Database connection failed:', err.message);
  process.exit(1);
});
