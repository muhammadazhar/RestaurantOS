-- ═══════════════════════════════════════════════════════════════════════════════
-- RestaurantOS — Migration 006: Add missing columns to orders table
-- Safe to re-run: all statements use IF NOT EXISTS
-- Adds: shift_id, customer_lat, customer_lng, rider_id, picked_at, delivered_at
-- Also updates status/order_type CHECK constraints for delivery statuses
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── orders: shift tracking ────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL;

-- ── orders: GPS coordinates ───────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lat  DECIMAL(10,7) DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_lng  DECIMAL(10,7) DEFAULT NULL;

-- ── orders: rider assignment ──────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rider_id UUID REFERENCES employees(id) ON DELETE SET NULL;

-- ── orders: delivery lifecycle timestamps ────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS picked_at    TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL;

-- ── orders: extend status CHECK to include delivery statuses ──────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending','confirmed','preparing','ready','served','paid','cancelled',
    'picked','out_for_delivery','delivered'
  ));

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_rider  ON orders(restaurant_id, rider_id)  WHERE rider_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_shift  ON orders(restaurant_id, shift_id)  WHERE shift_id  IS NOT NULL;
