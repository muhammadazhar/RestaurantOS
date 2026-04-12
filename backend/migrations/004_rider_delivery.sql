-- ═══════════════════════════════════════════════════════════════════════════════
-- RestaurantOS — Rider Delivery Management System
-- Migration 004: Phone orders, rider assignment, collections, incentives
-- Safe to re-run: uses IF NOT EXISTS / ALTER ... IF NOT EXISTS patterns
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend orders table ────────────────────────────────────────────────────
-- Add rider_id (FK to employees — internal rider)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- GPS coordinates for delivery address
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat  DECIMAL(10,7) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng  DECIMAL(10,7) DEFAULT NULL;

-- Delivery lifecycle timestamps
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_at     TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ DEFAULT NULL;

-- Extend status CHECK constraint to include delivery statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending','confirmed','preparing','ready','served','paid','cancelled',
    'picked','out_for_delivery','delivered'
  ));

CREATE INDEX IF NOT EXISTS idx_orders_rider ON orders(restaurant_id, rider_id) WHERE rider_id IS NOT NULL;

-- ── 2. rider_collections ──────────────────────────────────────────────────────
-- Records per-order cash/card collection by the rider at the customer door
CREATE TABLE IF NOT EXISTS rider_collections (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cash_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  card_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_collected   DECIMAL(10,2) NOT NULL DEFAULT 0,
  tendered_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  change_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method    VARCHAR(20)   NOT NULL DEFAULT 'cash'
                      CHECK (payment_method IN ('cash','card','mixed')),
  status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','submitted','verified')),
  collected_at      TIMESTAMPTZ DEFAULT NULL,
  submitted_at      TIMESTAMPTZ DEFAULT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id)
);
CREATE INDEX IF NOT EXISTS idx_rider_collections_rider    ON rider_collections(restaurant_id, rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_collections_status   ON rider_collections(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_rider_collections_date     ON rider_collections(restaurant_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_rider_collections_updated_at
  BEFORE UPDATE ON rider_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. cashier_collections ────────────────────────────────────────────────────
-- Records when cashier collects the day's cash/card from each rider
CREATE TABLE IF NOT EXISTS cashier_collections (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rider_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cashier_id        UUID          REFERENCES employees(id) ON DELETE SET NULL,
  collection_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  submitted_amount  DECIMAL(10,2) NOT NULL DEFAULT 0,
  shortage_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  extra_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','collected')),
  collected_at      TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cashier_collections_rider   ON cashier_collections(restaurant_id, rider_id, collection_date);
CREATE INDEX IF NOT EXISTS idx_cashier_collections_date    ON cashier_collections(restaurant_id, collection_date DESC);
CREATE INDEX IF NOT EXISTS idx_cashier_collections_status  ON cashier_collections(restaurant_id, status);

CREATE OR REPLACE TRIGGER trg_cashier_collections_updated_at
  BEFORE UPDATE ON cashier_collections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. rider_incentive_rules ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_incentive_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  description       TEXT,
  rule_type         VARCHAR(30) NOT NULL DEFAULT 'per_delivery'
                      CHECK (rule_type IN ('per_delivery','milestone','monthly_bonus','rating_bonus')),
  -- per_delivery: fixed amount per delivery
  per_delivery_amount DECIMAL(10,2) DEFAULT 0,
  -- milestone: bonus when reaching N deliveries in period
  milestone_count   INT DEFAULT NULL,
  milestone_bonus   DECIMAL(10,2) DEFAULT 0,
  -- monthly_bonus: bonus when total deliveries >= min_deliveries
  min_deliveries    INT DEFAULT 0,
  bonus_amount      DECIMAL(10,2) DEFAULT 0,
  -- period for calculation
  period            VARCHAR(20) DEFAULT 'monthly'
                      CHECK (period IN ('daily','weekly','monthly')),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incentive_rules_restaurant ON rider_incentive_rules(restaurant_id);

CREATE OR REPLACE TRIGGER trg_incentive_rules_updated_at
  BEFORE UPDATE ON rider_incentive_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 5. rider_incentive_payments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rider_incentive_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id     UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  rider_id          UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  rule_id           UUID          REFERENCES rider_incentive_rules(id) ON DELETE SET NULL,
  rule_name         VARCHAR(100),
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  deliveries_count  INT NOT NULL DEFAULT 0,
  amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  status            VARCHAR(20)   NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','paid')),
  notes             TEXT,
  approved_by       UUID REFERENCES employees(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ DEFAULT NULL,
  paid_at           TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_incentive_payments_rider  ON rider_incentive_payments(restaurant_id, rider_id);
CREATE INDEX IF NOT EXISTS idx_incentive_payments_status ON rider_incentive_payments(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_incentive_payments_period ON rider_incentive_payments(restaurant_id, period_start DESC);

-- ── Unique constraint for cashier_collections ─────────────────────────────────
ALTER TABLE cashier_collections DROP CONSTRAINT IF EXISTS cashier_collections_rider_date_unique;
ALTER TABLE cashier_collections ADD CONSTRAINT cashier_collections_rider_date_unique
  UNIQUE (restaurant_id, rider_id, collection_date);

-- ── Add tax_rate column to restaurants if missing ─────────────────────────────
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0;
