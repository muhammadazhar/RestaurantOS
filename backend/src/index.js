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

  // Migration 008b: expand shifts status CHECK to include in_process + closed
  await db.query(`
    ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
    ALTER TABLE shifts ADD CONSTRAINT shifts_status_check
      CHECK (status IN ('scheduled','active','in_process','completed','closed','absent'));
  `).catch(e => console.warn('Migration 008b note:', e.message));

  // Migration 010: Module-based licensing system
  await db.query(`
    CREATE TABLE IF NOT EXISTS modules (
      key         TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT
    );
    INSERT INTO modules(key, name, description) VALUES
      ('base',      'RestaurantOS Base',   'Core POS, orders, kitchen display'),
      ('tables',    'Table Management',    'Tables and reservations'),
      ('inventory', 'Inventory & Recipes', 'Stock management, recipes, menu management'),
      ('staff',     'Staff Management',    'Employees, attendance, shifts'),
      ('rider',     'Rider Delivery',      'Rider management, delivery tracking, incentives'),
      ('gl',        'General Ledger',      'Double-entry accounting, GL reports'),
      ('reports',   'Advanced Reports',    'Sales reports, shift reports, analytics')
    ON CONFLICT (key) DO NOTHING;

    CREATE TABLE IF NOT EXISTS module_pricing (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      module_key   TEXT NOT NULL REFERENCES modules(key),
      plan_type    TEXT NOT NULL CHECK (plan_type IN ('trial','monthly','quarterly','half_yearly','yearly')),
      price        NUMERIC(10,2) NOT NULL DEFAULT 0,
      duration_days INTEGER NOT NULL,
      is_active    BOOLEAN DEFAULT TRUE,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(module_key, plan_type)
    );
    INSERT INTO module_pricing(module_key, plan_type, price, duration_days) VALUES
      ('base','trial',0,14),      ('base','monthly',2999,30),   ('base','quarterly',7999,90),
      ('base','half_yearly',14999,180),('base','yearly',25999,365),
      ('tables','trial',0,14),    ('tables','monthly',999,30),  ('tables','quarterly',2499,90),
      ('tables','half_yearly',4499,180),('tables','yearly',7999,365),
      ('inventory','trial',0,14), ('inventory','monthly',1499,30),('inventory','quarterly',3999,90),
      ('inventory','half_yearly',7499,180),('inventory','yearly',12999,365),
      ('staff','trial',0,14),     ('staff','monthly',999,30),   ('staff','quarterly',2499,90),
      ('staff','half_yearly',4499,180),('staff','yearly',7999,365),
      ('rider','trial',0,14),     ('rider','monthly',1999,30),  ('rider','quarterly',5499,90),
      ('rider','half_yearly',9999,180),('rider','yearly',17999,365),
      ('gl','trial',0,14),        ('gl','monthly',1499,30),     ('gl','quarterly',3999,90),
      ('gl','half_yearly',7499,180),('gl','yearly',12999,365),
      ('reports','trial',0,14),   ('reports','monthly',999,30), ('reports','quarterly',2499,90),
      ('reports','half_yearly',4499,180),('reports','yearly',7999,365)
    ON CONFLICT (module_key, plan_type) DO NOTHING;

    CREATE TABLE IF NOT EXISTS subscriptions (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      module_key    TEXT NOT NULL REFERENCES modules(key),
      plan_type     TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('trial','active','pending_payment','expired','cancelled','rejected')),
      starts_at     TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      price         NUMERIC(10,2),
      payment_notes TEXT,
      requested_at  TIMESTAMPTZ DEFAULT NOW(),
      approved_at   TIMESTAMPTZ,
      approved_by   UUID,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(e => console.warn('Migration 010 note:', e.message));

  // Migration 012: Company groups, branch support, multi-level Chart of Accounts
  await db.query(`
    CREATE TABLE IF NOT EXISTS company_groups (
      id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                 TEXT NOT NULL,
      slug                 TEXT UNIQUE NOT NULL,
      email                TEXT,
      phone                TEXT,
      address              TEXT,
      logo_url             TEXT,
      status               TEXT DEFAULT 'active' CHECK (status IN ('active','suspended')),
      owner_restaurant_id  UUID,
      created_at           TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS company_group_id UUID REFERENCES company_groups(id) ON DELETE SET NULL;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS branch_code TEXT;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS is_branch BOOLEAN DEFAULT FALSE;

    CREATE TABLE IF NOT EXISTS group_branch_discounts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      min_branches   INTEGER NOT NULL,
      discount_pct   NUMERIC(5,2) NOT NULL,
      UNIQUE(min_branches)
    );
    INSERT INTO group_branch_discounts(min_branches, discount_pct) VALUES
      (2, 10), (3, 15), (5, 20), (10, 25)
    ON CONFLICT (min_branches) DO NOTHING;

    ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES gl_accounts(id) ON DELETE SET NULL;
    ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS is_header   BOOLEAN DEFAULT FALSE;
    ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS level       INTEGER DEFAULT 1;
    ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS is_active   BOOLEAN DEFAULT TRUE;
  `).catch(e => console.warn('Migration 012 note:', e.message));

  // Migration 013: owner_restaurant_id on company_groups + branch city
  await db.query(`
    ALTER TABLE company_groups ADD COLUMN IF NOT EXISTS owner_restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city TEXT;
  `).catch(e => console.warn('Migration 013 note:', e.message));

  // Migration 014: auto-assign standalone restaurants (no company group) to their own group
  // Each becomes the "main" / owner of its auto-created group
  await db.query(`
    INSERT INTO company_groups (name, slug, email, phone, address, status, owner_restaurant_id)
    SELECT
      r.name,
      r.slug || '-grp-' || substring(r.id::text FROM 1 FOR 8),
      r.email,
      r.phone,
      r.address,
      'active',
      r.id
    FROM restaurants r
    WHERE r.company_group_id IS NULL
    ON CONFLICT (slug) DO NOTHING;

    UPDATE restaurants r
    SET company_group_id = cg.id, is_branch = TRUE
    FROM company_groups cg
    WHERE cg.owner_restaurant_id = r.id
      AND r.company_group_id IS NULL;
  `).catch(e => console.warn('Migration 014 note:', e.message));

  // Migration 016: Category parent_id (sub-categories) + description column
  await db.query(`
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id    UUID REFERENCES categories(id) ON DELETE SET NULL;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS description  TEXT;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT TRUE;
    ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url    TEXT;
  `).catch(e => console.warn('Migration 016 note:', e.message));

  // Migration 015: Customer support ticketing system
  await db.query(`
    INSERT INTO modules(key, name, description) VALUES
      ('support', 'Customer Support', 'Support ticketing system for restaurants')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO module_pricing(module_key, plan_type, price, duration_days) VALUES
      ('support','trial',0,14),
      ('support','monthly',499,30),
      ('support','quarterly',1299,90),
      ('support','half_yearly',2499,180),
      ('support','yearly',3999,365)
    ON CONFLICT (module_key, plan_type) DO NOTHING;

    CREATE TABLE IF NOT EXISTS support_tickets (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      created_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
      title            TEXT NOT NULL,
      description      TEXT,
      screenshot_url   TEXT,
      status           TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','assigned','in_progress','resolved','closed')),
      assigned_to_name TEXT,
      resolved_at      TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ticket_messages (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id    UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_type  TEXT NOT NULL CHECK (sender_type IN ('restaurant','admin')),
      sender_name  TEXT,
      message      TEXT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(e => console.warn('Migration 015 note:', e.message));

  // Migration 009: GL account mappings for auto-journalizing
  await db.query(`
    CREATE TABLE IF NOT EXISTS gl_sales_mappings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      category_id      UUID REFERENCES categories(id) ON DELETE CASCADE,
      revenue_account_id UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
      UNIQUE(restaurant_id, category_id)
    );
    CREATE TABLE IF NOT EXISTS gl_payment_mappings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      payment_method   TEXT NOT NULL,
      account_id       UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
      UNIQUE(restaurant_id, payment_method)
    );
    CREATE TABLE IF NOT EXISTS gl_inventory_mappings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
      asset_account_id  UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
      expense_account_id UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
      UNIQUE(restaurant_id, inventory_item_id)
    );
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS gl_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
    ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS gl_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;
  `).catch(e => console.warn('Migration 009 note:', e.message));

  // Migration 019: system_config table
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_config (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(e => console.warn('Migration 019 note:', e.message));

  // Migration 018: waiter_id on orders
  await db.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS waiter_id UUID REFERENCES employees(id) ON DELETE SET NULL;
  `).catch(e => console.warn('Migration 018 note:', e.message));

  // Migration 020: Delivery pricing engine
  await db.query(`
    -- Restaurant origin lat/lng for distance fallback
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lat DECIMAL(10,7) DEFAULT NULL;
    ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lng DECIMAL(10,7) DEFAULT NULL;

    -- Delivery fee & rider payout on orders
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee    NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_payout    NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone_id UUID DEFAULT NULL;

    -- Delivery zones (polygon or distance-range based)
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      sort_order     INT  DEFAULT 0,
      -- Distance-range fallback (km)
      min_km         NUMERIC(8,3) DEFAULT 0,
      max_km         NUMERIC(8,3) DEFAULT NULL,
      -- Pricing
      customer_fee   NUMERIC(10,2) NOT NULL DEFAULT 0,
      rider_payout   NUMERIC(10,2) NOT NULL DEFAULT 0,
      -- Polygon GeoJSON (null = use distance range only)
      polygon        JSONB DEFAULT NULL,
      is_active      BOOLEAN DEFAULT TRUE,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, name)
    );

    -- Named areas mapped to zones (e.g. "Nazimabad" → Zone 1)
    CREATE TABLE IF NOT EXISTS delivery_areas (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      zone_id        UUID NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      -- Optional representative lat/lng for map pin
      lat            DECIMAL(10,7) DEFAULT NULL,
      lng            DECIMAL(10,7) DEFAULT NULL,
      is_active      BOOLEAN DEFAULT TRUE,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, name)
    );

    -- Surge pricing rules
    CREATE TABLE IF NOT EXISTS delivery_surge_rules (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      -- Trigger type: 'peak_hours' | 'manual' | 'weather'
      trigger_type   TEXT NOT NULL DEFAULT 'peak_hours'
                     CHECK (trigger_type IN ('peak_hours','manual','weather')),
      -- Peak hours window (HH:MM strings, nullable for manual/weather)
      start_time     TIME DEFAULT NULL,
      end_time       TIME DEFAULT NULL,
      -- Days of week: comma list '1,2,3,4,5' (1=Mon … 7=Sun), null = all days
      days_of_week   TEXT DEFAULT NULL,
      -- Adjustment: flat addition or multiplier
      adj_type       TEXT NOT NULL DEFAULT 'flat' CHECK (adj_type IN ('flat','multiplier')),
      adj_value      NUMERIC(10,2) NOT NULL DEFAULT 0,
      is_active      BOOLEAN DEFAULT TRUE,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    -- VIP / special customer rules (by phone number)
    CREATE TABLE IF NOT EXISTS delivery_customer_rules (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id  UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      phone          TEXT NOT NULL,
      rule_type      TEXT NOT NULL DEFAULT 'free_delivery'
                     CHECK (rule_type IN ('free_delivery','flat_discount','pct_discount')),
      discount_value NUMERIC(10,2) DEFAULT 0,
      note           TEXT,
      is_active      BOOLEAN DEFAULT TRUE,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, phone)
    );

    -- maps module
    INSERT INTO modules(key, name, description) VALUES
      ('maps', 'Delivery Zone Maps', 'Visual zone editor with Leaflet polygon drawing for delivery pricing')
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO module_pricing(module_key, plan_type, price, duration_days) VALUES
      ('maps','trial',0,14),
      ('maps','monthly',799,30),
      ('maps','quarterly',1999,90),
      ('maps','half_yearly',3499,180),
      ('maps','yearly',5999,365)
    ON CONFLICT (module_key, plan_type) DO NOTHING;
  `).catch(e => console.warn('Migration 020 note:', e.message));

  // Migration 017: Opening balance for shifts + discount presets table
  await db.query(`
    ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(10,2) DEFAULT 0;
    ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_cash    NUMERIC(10,2);

    CREATE TABLE IF NOT EXISTS discount_presets (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL CHECK (type IN ('percent','flat')),
      value         NUMERIC(10,2) NOT NULL,
      is_active     BOOLEAN DEFAULT TRUE,
      sort_order    INT DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(restaurant_id, name)
    );
  `).catch(e => console.warn('Migration 017 note:', e.message));

  server.listen(PORT, () => {
    console.log(`✓ RestaurantOS API running on http://localhost:${PORT}`);
    console.log(`✓ WebSocket ready`);
  });
}).catch(err => {
  console.error('✗ Database connection failed:', err.message);
  process.exit(1);
});
