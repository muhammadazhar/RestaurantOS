ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'variant',
  ADD COLUMN IF NOT EXISTS kitchen_route VARCHAR(120),
  ADD COLUMN IF NOT EXISTS tax_included BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tax_applicable BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS discount_eligible BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_pricing_mode_check'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_pricing_mode_check
      CHECK (pricing_mode IN ('variant','weight','piece','pack'));
  END IF;
END $$;

ALTER TABLE menu_item_variants
  ADD COLUMN IF NOT EXISTS value_label VARCHAR(80),
  ADD COLUMN IF NOT EXISTS cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE menu_item_variants
SET is_default = TRUE
WHERE id IN (
  SELECT DISTINCT ON (menu_item_id) id
  FROM menu_item_variants
  WHERE is_active = TRUE
  ORDER BY menu_item_id, sort_order, name
)
AND NOT EXISTS (
  SELECT 1
  FROM menu_item_variants mv2
  WHERE mv2.menu_item_id = menu_item_variants.menu_item_id
    AND mv2.is_default = TRUE
);

CREATE TABLE IF NOT EXISTS menu_item_addon_groups (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id   UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name           VARCHAR(120) NOT NULL,
  min_select     INT NOT NULL DEFAULT 0,
  max_select     INT NOT NULL DEFAULT 3,
  sort_order     INT NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_item_addons (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  addon_group_id  UUID NOT NULL REFERENCES menu_item_addon_groups(id) ON DELETE CASCADE,
  name            VARCHAR(120) NOT NULL,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_addon_groups_item
  ON menu_item_addon_groups(menu_item_id);

CREATE INDEX IF NOT EXISTS idx_menu_item_addons_group
  ON menu_item_addons(addon_group_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_addon_groups_updated'
  ) THEN
    CREATE TRIGGER trg_menu_item_addon_groups_updated
      BEFORE UPDATE ON menu_item_addon_groups
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_addons_updated'
  ) THEN
    CREATE TRIGGER trg_menu_item_addons_updated
      BEFORE UPDATE ON menu_item_addons
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
