CREATE SEQUENCE IF NOT EXISTS order_adjustment_number_seq;

CREATE TABLE IF NOT EXISTS order_adjustments (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id           UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  adjustment_number       VARCHAR(40) NOT NULL UNIQUE,
  type                    VARCHAR(30) NOT NULL
                            CHECK (type IN ('item_replacement','item_return','full_cancellation')),
  reason                  TEXT NOT NULL,
  status                  VARCHAR(20) NOT NULL DEFAULT 'completed'
                            CHECK (status IN ('pending','completed','voided')),
  original_subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  replacement_subtotal    DECIMAL(10,2) NOT NULL DEFAULT 0,
  refund_amount           DECIMAL(10,2) NOT NULL DEFAULT 0,
  additional_amount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  net_amount              DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_adjustment          DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_adjustment        DECIMAL(10,2) NOT NULL DEFAULT 0,
  original_payment_method VARCHAR(30),
  created_by              UUID REFERENCES employees(id) ON DELETE SET NULL,
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_adjustment_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  adjustment_id  UUID NOT NULL REFERENCES order_adjustments(id) ON DELETE CASCADE,
  order_item_id  UUID REFERENCES order_items(id) ON DELETE SET NULL,
  menu_item_id   UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  name           VARCHAR(150) NOT NULL,
  action         VARCHAR(20) NOT NULL CHECK (action IN ('return','sale')),
  quantity       INT NOT NULL DEFAULT 1,
  unit_price     DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount   DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_adjustments_restaurant
  ON order_adjustments(restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_adjustments_order
  ON order_adjustments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_adjustment_items_adjustment
  ON order_adjustment_items(adjustment_id);
