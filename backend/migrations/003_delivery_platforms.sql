-- ═══════════════════════════════════════════════════════════════════════════════
-- 003_delivery_platforms.sql — Online Delivery Platform Integration
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Add delivery columns to orders ──────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS platform              VARCHAR(30)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS platform_order_id    VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_address     JSONB         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS platform_commission  DECIMAL(8,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_name           VARCHAR(100)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rider_phone          VARCHAR(30)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason     TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accepted_at          TIMESTAMPTZ   DEFAULT NULL;

-- ── Platform integrations config ─────────────────────────────────────────────
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

-- ── Seed default platform rows for all restaurants ───────────────────────────
INSERT INTO platform_integrations(restaurant_id, platform, display_name, commission_pct)
SELECT r.id, p.platform, p.display_name, p.commission_pct
FROM restaurants r
CROSS JOIN (VALUES
  ('foodpanda',    'Foodpanda',    15.00),
  ('uber_eats',    'Uber Eats',    20.00),
  ('careem_food',  'Careem Food',  18.00)
) AS p(platform, display_name, commission_pct)
ON CONFLICT (restaurant_id, platform) DO NOTHING;

-- Trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_platform_integrations_updated') THEN
    CREATE TRIGGER trg_platform_integrations_updated BEFORE UPDATE ON platform_integrations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
