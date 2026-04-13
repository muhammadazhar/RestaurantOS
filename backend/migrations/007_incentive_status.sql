-- 007: extend rider_incentive_payments status to support rejected and received
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old narrow check constraint
ALTER TABLE rider_incentive_payments
  DROP CONSTRAINT IF EXISTS rider_incentive_payments_status_check;

-- Re-add with all valid statuses
ALTER TABLE rider_incentive_payments
  ADD CONSTRAINT rider_incentive_payments_status_check
    CHECK (status IN ('pending','approved','paid','rejected','received'));

-- Add received_at and updated_at columns
ALTER TABLE rider_incentive_payments
  ADD COLUMN IF NOT EXISTS received_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();
