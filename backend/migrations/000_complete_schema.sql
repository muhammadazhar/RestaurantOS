-- ═══════════════════════════════════════════════════════════════════════════════
-- RestaurantOS — Complete Database Schema
-- Single-file setup: run this once on any fresh PostgreSQL database (incl. Neon)
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Utility Functions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION check_inventory_alert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_quantity <= NEW.min_quantity THEN
    INSERT INTO notifications(restaurant_id, type, title, message, severity, reference_id, reference_type)
    VALUES (
      NEW.restaurant_id,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'inventory_critical' ELSE 'inventory_low' END,
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN '🚨 Critical Stock: ' ELSE '⚠️ Low Stock: ' END || NEW.name,
      NEW.name || ' is at ' || NEW.stock_quantity || ' ' || NEW.unit || ' (minimum: ' || NEW.min_quantity || ' ' || NEW.unit || ')',
      CASE WHEN NEW.stock_quantity <= (NEW.min_quantity * 0.5) THEN 'critical' ELSE 'high' END,
      NEW.id, 'inventory_item'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1 — Core Tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Plans ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(50)  NOT NULL UNIQUE,
  price_monthly   DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_employees   INT NOT NULL DEFAULT 10,
  max_tables      INT NOT NULL DEFAULT 20,
  features        JSONB DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Restaurants ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restaurants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id         UUID REFERENCES plans(id),
  name            VARCHAR(150) NOT NULL,
  slug            VARCHAR(100) NOT NULL UNIQUE,
  email           VARCHAR(150) NOT NULL UNIQUE,
  phone           VARCHAR(30),
  address         TEXT,
  city            VARCHAR(100),
  country         VARCHAR(100) DEFAULT 'Pakistan',
  currency        VARCHAR(10)  DEFAULT 'PKR',
  timezone        VARCHAR(50)  DEFAULT 'Asia/Karachi',
  logo_url        TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'trial'
                    CHECK (status IN ('trial','active','suspended','cancelled')),
  setup_complete  BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at   TIMESTAMPTZ  DEFAULT NOW() + INTERVAL '14 days',
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);

-- ── Super-admin Users ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(150) NOT NULL UNIQUE,
  password_hash   TEXT         NOT NULL,
  full_name       VARCHAR(150),
  is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Roles ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(50)  NOT NULL,
  permissions     JSONB        NOT NULL DEFAULT '[]',
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_roles_restaurant ON roles(restaurant_id);

-- ── Employees ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role_id         UUID REFERENCES roles(id),
  full_name       VARCHAR(150) NOT NULL,
  email           VARCHAR(150),
  phone           VARCHAR(30),
  pin             VARCHAR(10),
  password_hash   TEXT,
  salary          DECIMAL(10,2),
  avatar_url      TEXT,
  status          VARCHAR(20)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','inactive','terminated')),
  hired_at        DATE,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(restaurant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_employees_restaurant ON employees(restaurant_id);

-- ── Refresh Tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_employee ON refresh_tokens(employee_id);

-- ── Shifts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  shift_name      VARCHAR(100),
  date            DATE,
  start_time      TIME,
  end_time        TIME,
  is_overnight    BOOLEAN NOT NULL DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_shifts_restaurant ON shifts(restaurant_id, date);

CREATE TABLE IF NOT EXISTS shift_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  shift_date      DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','in_process','completed','closed')),
  opening_balance DECIMAL(10,2) DEFAULT 0,
  closing_cash    DECIMAL(10,2),
  cashier_collection DECIMAL(10,2),
  opened_at       TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_shift_date ON shift_sessions(shift_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_restaurant_date ON shift_sessions(restaurant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_employee_date ON shift_sessions(employee_id, shift_date);

-- ── Categories ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  image_url       TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id);

-- ── Menu Items ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost            DECIMAL(10,2),
  image_url       TEXT,
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  pricing_mode    VARCHAR(20) NOT NULL DEFAULT 'variant'
                    CHECK (pricing_mode IN ('variant','weight','piece','pack')),
  kitchen_route   VARCHAR(120),
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','draft','inactive')),
  visible_pos     BOOLEAN NOT NULL DEFAULT TRUE,
  visible_web     BOOLEAN NOT NULL DEFAULT TRUE,
  visible_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  tax_included    BOOLEAN NOT NULL DEFAULT TRUE,
  tax_applicable  BOOLEAN NOT NULL DEFAULT FALSE,
  discount_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  min_qty         DECIMAL(10,2) NOT NULL DEFAULT 1,
  max_qty         DECIMAL(10,2) NOT NULL DEFAULT 10,
  step_qty        DECIMAL(10,2) NOT NULL DEFAULT 1,
  round_off_rule  VARCHAR(40) NOT NULL DEFAULT 'nearest_0_50',
  service_charge_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
  price_override_role VARCHAR(40) NOT NULL DEFAULT 'manager_only',
  allow_open_price BOOLEAN NOT NULL DEFAULT FALSE,
  open_price_role VARCHAR(40) NOT NULL DEFAULT 'manager',
  hide_cost_on_pos BOOLEAN NOT NULL DEFAULT TRUE,
  combo_eligible BOOLEAN NOT NULL DEFAULT TRUE,
  weekend_price_rule BOOLEAN NOT NULL DEFAULT FALSE,
  weekend_price DECIMAL(10,2),
  weekend_days TEXT[] NOT NULL DEFAULT ARRAY['FRI','SAT'],
  promotion_label VARCHAR(80),
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ,
  sort_order      INT NOT NULL DEFAULT 0,
  tags            JSONB DEFAULT '[]',
  allergens       JSONB DEFAULT '[]',
  prep_time_min   INT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name            VARCHAR(80) NOT NULL,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  weekend_price   DECIMAL(10,2),
  badge           VARCHAR(120),
  value_label     VARCHAR(80),
  cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item ON menu_item_variants(menu_item_id);

CREATE TABLE IF NOT EXISTS menu_item_addon_groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  min_select      INT NOT NULL DEFAULT 0,
  max_select      INT NOT NULL DEFAULT 3,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_item_addon_groups_item ON menu_item_addon_groups(menu_item_id);

CREATE TABLE IF NOT EXISTS menu_item_addons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  addon_group_id  UUID NOT NULL REFERENCES menu_item_addon_groups(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  cost            DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_item_addons_group ON menu_item_addons(addon_group_id);

-- ── Dining Tables ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dining_tables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  label           VARCHAR(50) NOT NULL,
  capacity        INT NOT NULL DEFAULT 4,
  zone            VARCHAR(50),
  status          VARCHAR(20) NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','occupied','reserved','cleaning')),
  qr_code         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, label)
);
CREATE INDEX IF NOT EXISTS idx_dining_tables_restaurant ON dining_tables(restaurant_id);

-- ── Orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id           UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id                UUID REFERENCES dining_tables(id),
  employee_id             UUID REFERENCES employees(id),
  shift_id                UUID REFERENCES shifts(id),
  shift_session_id        UUID REFERENCES shift_sessions(id),
  order_number            VARCHAR(30) NOT NULL,
  order_type              VARCHAR(20) NOT NULL DEFAULT 'dine_in'
                            CHECK (order_type IN ('dine_in','takeaway','online','delivery')),
  status                  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','confirmed','preparing','ready','served','paid','cancelled')),
  source                  VARCHAR(30) NOT NULL DEFAULT 'pos'
                            CHECK (source IN ('pos','online','app','phone')),
  guest_count             INT NOT NULL DEFAULT 1,
  subtotal                DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_amount              DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method          VARCHAR(30),
  payment_status          VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                            CHECK (payment_status IN ('unpaid','paid','refunded')),
  customer_name           VARCHAR(150),
  customer_phone          VARCHAR(30),
  notes                   TEXT,
  -- Delivery platform fields
  platform                VARCHAR(30)   DEFAULT NULL,
  platform_order_id       VARCHAR(100)  DEFAULT NULL,
  delivery_address        JSONB         DEFAULT NULL,
  platform_commission     DECIMAL(8,2)  DEFAULT 0,
  rider_name              VARCHAR(100)  DEFAULT NULL,
  rider_phone             VARCHAR(30)   DEFAULT NULL,
  estimated_delivery_at   TIMESTAMPTZ   DEFAULT NULL,
  rejection_reason        TEXT          DEFAULT NULL,
  accepted_at             TIMESTAMPTZ   DEFAULT NULL,
  -- Timestamps
  preparing_at            TIMESTAMPTZ,
  ready_at                TIMESTAMPTZ,
  served_at               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ   DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(restaurant_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_shift_session ON orders(shift_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_platform ON orders(restaurant_id, platform) WHERE platform IS NOT NULL;

-- ── Order Items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id),
  name            VARCHAR(150) NOT NULL,
  quantity        INT NOT NULL DEFAULT 1,
  unit_price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price     DECIMAL(10,2) NOT NULL DEFAULT 0,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','preparing','ready','served','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── GL Accounts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gl_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  code            VARCHAR(20)  NOT NULL,
  name            VARCHAR(100) NOT NULL,
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('asset','liability','equity','revenue','cogs','expense')),
  is_system       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, code)
);

-- ── Journal Entries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL,
  reference       VARCHAR(100),
  description     TEXT,
  total_debit     DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_credit    DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_restaurant ON journal_entries(restaurant_id, entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id        UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES gl_accounts(id),
  debit           DECIMAL(12,2) NOT NULL DEFAULT 0,
  credit          DECIMAL(12,2) NOT NULL DEFAULT 0,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Inventory ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name            VARCHAR(150) NOT NULL,
  category        VARCHAR(100),
  unit            VARCHAR(30)  NOT NULL DEFAULT 'kg',
  stock_quantity  DECIMAL(10,3) NOT NULL DEFAULT 0,
  min_quantity    DECIMAL(10,3) NOT NULL DEFAULT 0,
  cost_per_unit   DECIMAL(10,2) NOT NULL DEFAULT 0,
  supplier        VARCHAR(150),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id),
  employee_id     UUID REFERENCES employees(id),
  type            VARCHAR(20)  NOT NULL CHECK (type IN ('in','out','adjustment','waste')),
  quantity        DECIMAL(10,3) NOT NULL,
  unit_cost       DECIMAL(10,2),
  reference       VARCHAR(100),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Recipes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id    UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  yield_quantity  DECIMAL(10,3) NOT NULL DEFAULT 1,
  yield_unit      VARCHAR(30),
  instructions    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  name            VARCHAR(150) NOT NULL,
  quantity        DECIMAL(10,3) NOT NULL,
  unit            VARCHAR(30),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  type            VARCHAR(50)  NOT NULL,
  title           VARCHAR(200) NOT NULL,
  message         TEXT,
  severity        VARCHAR(20)  NOT NULL DEFAULT 'info'
                    CHECK (severity IN ('info','warning','high','critical')),
  reference_id    UUID,
  reference_type  VARCHAR(50),
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_restaurant ON notifications(restaurant_id, is_read);

-- ── Reservations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  table_id        UUID REFERENCES dining_tables(id),
  customer_name   VARCHAR(150) NOT NULL,
  customer_phone  VARCHAR(30),
  guest_count     INT NOT NULL DEFAULT 2,
  reservation_at  TIMESTAMPTZ NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','seated','cancelled','no_show')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id, reservation_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2 — Attendance Module (002_attendance.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Overtime Rules ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overtime_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL DEFAULT 'Default',
  daily_regular_hours   DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  ot_multiplier         DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  holiday_multiplier    DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  ot_threshold_min      INT NOT NULL DEFAULT 30,
  ot_rounding_min       INT NOT NULL DEFAULT 15,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_rules_default ON overtime_rules(restaurant_id) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_ot_rules_restaurant ON overtime_rules(restaurant_id);

-- ── Holidays ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS att_holidays (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  date          DATE NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (type IN ('full','half')),
  is_paid       BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, date, name)
);
CREATE INDEX IF NOT EXISTS idx_holidays_restaurant_date ON att_holidays(restaurant_id, date);

-- ── Leave Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type      VARCHAR(30) NOT NULL CHECK (leave_type IN ('annual','sick','unpaid','emergency','compensatory')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  duration_type   VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (duration_type IN ('full','half_am','half_pm')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason          TEXT,
  approved_by     UUID REFERENCES employees(id),
  approved_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaves_employee   ON leaves(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leaves_restaurant ON leaves(restaurant_id, status);

-- ── Raw Attendance Logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id        UUID REFERENCES shifts(id),
  log_type        VARCHAR(20) NOT NULL CHECK (log_type IN ('clock_in','clock_out','break_start','break_end')),
  punched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attendance_date DATE NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web','manual','kiosk','mobile','api')),
  device_id       VARCHAR(100),
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  notes           TEXT,
  is_voided       BOOLEAN NOT NULL DEFAULT FALSE,
  voided_by       UUID REFERENCES employees(id),
  voided_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_att_logs_employee_date   ON attendance_logs(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_att_logs_restaurant_date ON attendance_logs(restaurant_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_att_logs_punched_at      ON attendance_logs(punched_at DESC);

-- ── Daily Attendance Summary ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_attendance (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id            UUID REFERENCES shifts(id),
  attendance_date     DATE NOT NULL,
  clock_in_at         TIMESTAMPTZ,
  clock_out_at        TIMESTAMPTZ,
  scheduled_minutes   INT,
  worked_minutes      INT NOT NULL DEFAULT 0,
  break_minutes       INT NOT NULL DEFAULT 0,
  late_minutes        INT NOT NULL DEFAULT 0,
  early_exit_minutes  INT NOT NULL DEFAULT 0,
  ot_minutes          INT NOT NULL DEFAULT 0,
  status              VARCHAR(30) NOT NULL DEFAULT 'absent' CHECK (status IN (
                        'present','absent','late','half_day','on_leave','holiday','weekend','on_leave_holiday'
                      )),
  leave_id            UUID REFERENCES leaves(id),
  holiday_id          UUID REFERENCES att_holidays(id),
  ot_rule_id          UUID REFERENCES overtime_rules(id),
  is_corrected        BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  computed_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_att_restaurant_date ON daily_attendance(restaurant_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_daily_att_employee        ON daily_attendance(employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_att_status          ON daily_attendance(restaurant_id, status, attendance_date);

-- ── Attendance Corrections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  daily_attendance_id   UUID REFERENCES daily_attendance(id),
  employee_id           UUID NOT NULL REFERENCES employees(id),
  requested_by          UUID REFERENCES employees(id),
  approved_by           UUID REFERENCES employees(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  attendance_date       DATE NOT NULL,
  original_clock_in     TIMESTAMPTZ,
  original_clock_out    TIMESTAMPTZ,
  corrected_clock_in    TIMESTAMPTZ,
  corrected_clock_out   TIMESTAMPTZ,
  original_status       VARCHAR(30),
  corrected_status      VARCHAR(30),
  reason                TEXT NOT NULL,
  rejection_note        TEXT,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corrections_restaurant ON attendance_corrections(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_employee   ON attendance_corrections(employee_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 3 — Delivery Platforms (003_delivery_platforms.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS platform_integrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  platform        VARCHAR(30) NOT NULL CHECK (platform IN ('foodpanda','uber_eats','careem_food','talabat','local')),
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  display_name    VARCHAR(100),
  api_key         VARCHAR(255),
  webhook_secret  VARCHAR(255),
  commission_pct  DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  auto_accept     BOOLEAN NOT NULL DEFAULT FALSE,
  prep_time_min   INT NOT NULL DEFAULT 30,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_platform_integrations_restaurant ON platform_integrations(restaurant_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 4 — Triggers
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  -- Core tables
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_restaurants_updated') THEN
    CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON restaurants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_employees_updated') THEN
    CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_items_updated') THEN
    CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_variants_updated') THEN
    CREATE TRIGGER trg_menu_item_variants_updated BEFORE UPDATE ON menu_item_variants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_addon_groups_updated') THEN
    CREATE TRIGGER trg_menu_item_addon_groups_updated BEFORE UPDATE ON menu_item_addon_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_addons_updated') THEN
    CREATE TRIGGER trg_menu_item_addons_updated BEFORE UPDATE ON menu_item_addons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_updated') THEN
    CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventory_updated') THEN
    CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inventory_alert') THEN
    CREATE TRIGGER trg_inventory_alert AFTER UPDATE OF stock_quantity ON inventory_items FOR EACH ROW EXECUTE FUNCTION check_inventory_alert();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_recipes_updated') THEN
    CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  -- Attendance
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_overtime_rules_updated') THEN
    CREATE TRIGGER trg_overtime_rules_updated BEFORE UPDATE ON overtime_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leaves_updated') THEN
    CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON leaves FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_daily_att_updated') THEN
    CREATE TRIGGER trg_daily_att_updated BEFORE UPDATE ON daily_attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_corrections_updated') THEN
    CREATE TRIGGER trg_corrections_updated BEFORE UPDATE ON attendance_corrections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  -- Delivery
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_platform_integrations_updated') THEN
    CREATE TRIGGER trg_platform_integrations_updated BEFORE UPDATE ON platform_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 5 — Seed Data
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Plans ─────────────────────────────────────────────────────────────────────
INSERT INTO plans(name, price_monthly, max_employees, max_tables, features) VALUES
  ('Starter',      0,     5,  10, '["pos","kitchen","tables","inventory"]'),
  ('Professional', 4999,  20, 50, '["pos","kitchen","tables","inventory","recipes","employees","gl","reports","attendance"]'),
  ('Enterprise',   9999,  100,200,'["pos","kitchen","tables","inventory","recipes","employees","gl","reports","attendance","delivery","api"]')
ON CONFLICT (name) DO NOTHING;

-- ── Demo Restaurant — The Golden Fork ─────────────────────────────────────────
DO $$
DECLARE
  v_restaurant_id UUID := 'b1000000-0000-0000-0000-000000000001';
  v_plan_id       UUID;
  v_manager_id    UUID := 'c1000000-0000-0000-0000-000000000001';
  v_role_id       UUID := 'd1000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_plan_id FROM plans WHERE name = 'Professional' LIMIT 1;

  -- Restaurant
  INSERT INTO restaurants(id, plan_id, name, slug, email, phone, address, city, country, currency, timezone, status, setup_complete)
  VALUES (v_restaurant_id, v_plan_id, 'The Golden Fork', 'golden-fork',
          'admin@goldenfork.com', '+92-21-1234567', '123 Main Street', 'Karachi',
          'Pakistan', 'PKR', 'Asia/Karachi', 'active', TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Manager role
  INSERT INTO roles(id, restaurant_id, name, permissions, is_system)
  VALUES (v_role_id, v_restaurant_id, 'Manager',
    '["dashboard","pos","kitchen","tables","inventory","recipes","employees","attendance","shift_management","gl","alerts","settings"]'::jsonb, TRUE)
  ON CONFLICT (id) DO NOTHING;

  -- Other roles
  INSERT INTO roles(restaurant_id, name, permissions, is_system) VALUES
    (v_restaurant_id, 'Head Server',  '["pos","kitchen","tables","alerts"]',              FALSE),
    (v_restaurant_id, 'Server',       '["pos","tables","alerts"]',                        FALSE),
    (v_restaurant_id, 'Chef',         '["kitchen","recipes","inventory","alerts"]',        FALSE),
    (v_restaurant_id, 'Cashier',      '["pos","alerts"]',                                 FALSE)
  ON CONFLICT (restaurant_id, name) DO NOTHING;

  -- Admin employee (password: password123)
  INSERT INTO employees(id, restaurant_id, role_id, full_name, email, password_hash)
  VALUES (v_manager_id, v_restaurant_id, v_role_id, 'Ahmed Khan', 'ahmed@goldenfork.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi')
  ON CONFLICT (id) DO NOTHING;

  -- GL Accounts
  INSERT INTO gl_accounts(restaurant_id, code, name, type, is_system) VALUES
    (v_restaurant_id, '4001', 'Food Revenue',     'revenue', TRUE),
    (v_restaurant_id, '4002', 'Beverage Revenue', 'revenue', TRUE),
    (v_restaurant_id, '4003', 'Online Revenue',   'revenue', TRUE),
    (v_restaurant_id, '5001', 'Food Cost',        'cogs',    TRUE),
    (v_restaurant_id, '5002', 'Beverage Cost',    'cogs',    TRUE),
    (v_restaurant_id, '6001', 'Staff Wages',      'expense', TRUE),
    (v_restaurant_id, '6002', 'Rent & Utilities', 'expense', TRUE),
    (v_restaurant_id, '6003', 'Supplies',         'expense', TRUE),
    (v_restaurant_id, '1001', 'Cash on Hand',     'asset',   TRUE),
    (v_restaurant_id, '1002', 'Bank Account',     'asset',   TRUE)
  ON CONFLICT (restaurant_id, code) DO NOTHING;

  -- Delivery platforms
  INSERT INTO platform_integrations(restaurant_id, platform, display_name, commission_pct) VALUES
    (v_restaurant_id, 'foodpanda',   'Foodpanda',   15.00),
    (v_restaurant_id, 'uber_eats',   'Uber Eats',   20.00),
    (v_restaurant_id, 'careem_food', 'Careem Food', 18.00)
  ON CONFLICT (restaurant_id, platform) DO NOTHING;

END $$;

-- ── Seed delivery platforms for all OTHER restaurants too ─────────────────────
INSERT INTO platform_integrations(restaurant_id, platform, display_name, commission_pct)
SELECT r.id, p.platform, p.display_name, p.commission_pct
FROM restaurants r
CROSS JOIN (VALUES
  ('foodpanda',    'Foodpanda',    15.00),
  ('uber_eats',    'Uber Eats',    20.00),
  ('careem_food',  'Careem Food',  18.00)
) AS p(platform, display_name, commission_pct)
ON CONFLICT (restaurant_id, platform) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done!
-- Login: slug=golden-fork  email=ahmed@goldenfork.com  password=password123
-- ═══════════════════════════════════════════════════════════════════════════════
