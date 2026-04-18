ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id),
  ADD COLUMN IF NOT EXISTS shift_session_id UUID REFERENCES shift_sessions(id);

CREATE INDEX IF NOT EXISTS idx_orders_shift_session
  ON orders(shift_session_id);
