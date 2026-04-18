ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS visible_pos BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS visible_web BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS visible_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_status_check'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_status_check
      CHECK (status IN ('active','draft','inactive'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS menu_item_variants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         VARCHAR(80) NOT NULL,
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  badge        VARCHAR(120),
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item
  ON menu_item_variants(menu_item_id);

INSERT INTO menu_item_variants(menu_item_id, name, price, badge, sort_order, is_active)
SELECT mi.id, 'Regular', mi.price, NULL, 0, TRUE
FROM menu_items mi
WHERE NOT EXISTS (
  SELECT 1 FROM menu_item_variants mv WHERE mv.menu_item_id = mi.id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_menu_item_variants_updated'
  ) THEN
    CREATE TRIGGER trg_menu_item_variants_updated
      BEFORE UPDATE ON menu_item_variants
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
