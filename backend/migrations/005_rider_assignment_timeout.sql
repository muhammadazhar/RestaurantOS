-- ═══════════════════════════════════════════════════════════════════════════════
-- RestaurantOS — Rider Assignment Timeout + Claim System
-- Migration 005: assignment_expires_at, pickup_timeout_minutes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Tracks when a rider's claim on a phone order expires (auto-release back to pool)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assignment_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Per-restaurant configurable timeout in minutes (default 10)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pickup_timeout_minutes INT NOT NULL DEFAULT 10;

CREATE INDEX IF NOT EXISTS idx_orders_assignment_expires
  ON orders(restaurant_id, assignment_expires_at)
  WHERE assignment_expires_at IS NOT NULL;
