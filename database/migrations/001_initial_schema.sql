-- ============================================================
-- RestaurantOS - Initial Schema Migration
-- Version: 1.0.0
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- PLANS (SaaS subscription tiers)
-- ─────────────────────────────────────────────
CREATE TABLE plans (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(50) NOT NULL UNIQUE,
  price        DECIMAL(10,2) NOT NULL,
  max_tables   INT NOT NULL DEFAULT 10,
  max_employees INT NOT NULL DEFAULT 15,
  features     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- RESTAURANTS (tenants)
-- ─────────────────────────────────────────────
CREATE TABLE restaurants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID REFERENCES plans(id),
  name            VARCHAR(150) NOT NULL,
  slug            VARCHAR(100) UNIQUE NOT NULL,
  email           VARCHAR(150) UNIQUE NOT NULL,
  phone           VARCHAR(30),
  address         TEXT,
  city            VARCHAR(100),
  country         VARCHAR(100) DEFAULT 'Pakistan',
  currency        VARCHAR(10) DEFAULT 'PKR',
  timezone        VARCHAR(60) DEFAULT 'Asia/Karachi',
  logo_url        TEXT,
  status          VARCHAR(20) DEFAULT 'trial' CHECK (status IN ('trial','active','suspended','cancelled')),
  trial_ends_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ROLES
-- ─────────────────────────────────────────────
CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(60) NOT NULL,
  permissions   JSONB DEFAULT '[]',
  is_system     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS (platform-level: super admins)
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(150) NOT NULL,
  is_super_admin BOOLEAN DEFAULT FALSE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- EMPLOYEES (per-restaurant staff)
-- ─────────────────────────────────────────────
CREATE TABLE employees (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role_id       UUID REFERENCES roles(id),
  full_name     VARCHAR(150) NOT NULL,
  email         VARCHAR(150),
  phone         VARCHAR(30),
  pin           VARCHAR(10),
  password_hash VARCHAR(255),
  salary        DECIMAL(10,2),
  status        VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','on_leave')),
  avatar_url    TEXT,
  joined_date   DATE DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, email)
);

-- ─────────────────────────────────────────────
-- SHIFTS
-- ─────────────────────────────────────────────
CREATE TABLE shifts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id   UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_name    VARCHAR(50) NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  date          DATE NOT NULL,
  status        VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','absent')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- TABLES (dining tables)
-- ─────────────────────────────────────────────
CREATE TABLE dining_tables (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label         VARCHAR(20) NOT NULL,
  section       VARCHAR(50) DEFAULT 'Main',
  capacity      INT NOT NULL DEFAULT 4,
  status        VARCHAR(20) DEFAULT 'vacant' CHECK (status IN ('vacant','occupied','reserved','cleaning')),
  position_x    INT DEFAULT 0,
  position_y    INT DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, label)
);

-- ─────────────────────────────────────────────
-- RESERVATIONS
-- ─────────────────────────────────────────────
CREATE TABLE reservations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id      UUID REFERENCES dining_tables(id),
  guest_name    VARCHAR(150) NOT NULL,
  guest_phone   VARCHAR(30),
  guest_count   INT NOT NULL DEFAULT 1,
  reserved_at   TIMESTAMPTZ NOT NULL,
  duration_min  INT DEFAULT 90,
  status        VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','seated','cancelled','no_show')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  sort_order    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);

-- ─────────────────────────────────────────────
-- MENU ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id),
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL,
  cost            DECIMAL(10,2) DEFAULT 0,
  prep_time_min   INT DEFAULT 10,
  image_url       TEXT,
  is_available    BOOLEAN DEFAULT TRUE,
  is_popular      BOOLEAN DEFAULT FALSE,
  tags            TEXT[],
  allergens       TEXT[],
  sort_order      INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- RECIPES
-- ─────────────────────────────────────────────
CREATE TABLE recipes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id),
  name            VARCHAR(150) NOT NULL,
  instructions    TEXT,
  prep_time_min   INT DEFAULT 10,
  cook_time_min   INT DEFAULT 20,
  serves          INT DEFAULT 1,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INVENTORY ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  unit            VARCHAR(30) NOT NULL,
  stock_quantity  DECIMAL(12,3) DEFAULT 0,
  min_quantity    DECIMAL(12,3) DEFAULT 0,
  max_quantity    DECIMAL(12,3) DEFAULT 100,
  cost_per_unit   DECIMAL(10,4) DEFAULT 0,
  supplier        VARCHAR(150),
  barcode         VARCHAR(100),
  category        VARCHAR(100) DEFAULT 'General',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);

-- ─────────────────────────────────────────────
-- RECIPE INGREDIENTS (links recipe → inventory)
-- ─────────────────────────────────────────────
CREATE TABLE recipe_ingredients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  name            VARCHAR(150) NOT NULL,
  quantity        DECIMAL(12,4) NOT NULL,
  unit            VARCHAR(30) NOT NULL
);

-- ─────────────────────────────────────────────
-- INVENTORY TRANSACTIONS
-- ─────────────────────────────────────────────
CREATE TABLE inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  employee_id     UUID REFERENCES employees(id),
  type            VARCHAR(30) NOT NULL CHECK (type IN ('purchase','usage','adjustment','waste','transfer')),
  quantity        DECIMAL(12,3) NOT NULL,
  cost_per_unit   DECIMAL(10,4),
  total_cost      DECIMAL(10,2),
  notes           TEXT,
  reference       VARCHAR(100),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- ORDERS
-- ─────────────────────────────────────────────
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id        UUID REFERENCES dining_tables(id),
  employee_id     UUID REFERENCES employees(id),
  order_number    VARCHAR(20) NOT NULL,
  order_type      VARCHAR(20) DEFAULT 'dine_in' CHECK (order_type IN ('dine_in','takeaway','online','delivery')),
  status          VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','served','paid','cancelled')),
  source          VARCHAR(30) DEFAULT 'pos' CHECK (source IN ('pos','online','app','phone')),
  guest_count     INT DEFAULT 1,
  subtotal        DECIMAL(10,2) DEFAULT 0,
  tax_amount      DECIMAL(10,2) DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  total_amount    DECIMAL(10,2) DEFAULT 0,
  payment_method  VARCHAR(30),
  payment_status  VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','partial')),
  customer_name   VARCHAR(150),
  customer_phone  VARCHAR(30),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, order_number)
);

-- ─────────────────────────────────────────────
-- ORDER ITEMS
-- ─────────────────────────────────────────────
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id),
  name            VARCHAR(150) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  unit_price      DECIMAL(10,2) NOT NULL,
  total_price     DECIMAL(10,2) NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','cooking','ready','served','cancelled')),
  modifiers       JSONB DEFAULT '[]',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS / ALERTS
-- ─────────────────────────────────────────────
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type            VARCHAR(30) NOT NULL CHECK (type IN ('inventory_low','inventory_critical','order_ready','order_delayed','system','shift_reminder')),
  title           VARCHAR(200) NOT NULL,
  message         TEXT NOT NULL,
  severity        VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('info','low','high','critical')),
  is_read         BOOLEAN DEFAULT FALSE,
  reference_id    UUID,
  reference_type  VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- GL ACCOUNTS
-- ─────────────────────────────────────────────
CREATE TABLE gl_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code            VARCHAR(20) NOT NULL,
  name            VARCHAR(150) NOT NULL,
  type            VARCHAR(30) NOT NULL CHECK (type IN ('revenue','cogs','expense','asset','liability','equity')),
  is_system       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, code)
);

-- ─────────────────────────────────────────────
-- GL JOURNAL ENTRIES
-- ─────────────────────────────────────────────
CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  reference       VARCHAR(100),
  description     TEXT NOT NULL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE journal_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id        UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES gl_accounts(id),
  debit           DECIMAL(12,2) DEFAULT 0,
  credit          DECIMAL(12,2) DEFAULT 0,
  notes           TEXT
);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_employees_restaurant ON employees(restaurant_id);
CREATE INDEX idx_dining_tables_restaurant ON dining_tables(restaurant_id);
CREATE INDEX idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_inventory_restaurant ON inventory_items(restaurant_id);
CREATE INDEX idx_notifications_restaurant ON notifications(restaurant_id, is_read);
CREATE INDEX idx_journal_entries_restaurant ON journal_entries(restaurant_id, entry_date);
CREATE INDEX idx_shifts_employee ON shifts(employee_id, date);

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- AUTO INVENTORY ALERT function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_inventory_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity <= NEW.min_quantity THEN
    INSERT INTO notifications(restaurant_id, type, title, message, severity, reference_id, reference_type)
    VALUES (
      NEW.restaurant_id,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'inventory_critical' ELSE 'inventory_low' END,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN '🚨 Critical Stock: ' ELSE '⚠️ Low Stock: ' END || NEW.name,
      NEW.name || ' is at ' || NEW.stock_quantity || ' ' || NEW.unit || ' (minimum: ' || NEW.min_quantity || ' ' || NEW.unit || ')',
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'critical' ELSE 'high' END,
      NEW.id,
      'inventory_item'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_alert
AFTER UPDATE OF stock_quantity ON inventory_items
FOR EACH ROW EXECUTE FUNCTION check_inventory_alert();
