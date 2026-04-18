ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS date_from DATE,
  ADD COLUMN IF NOT EXISTS date_to DATE,
  ADD COLUMN IF NOT EXISTS working_days INT[] DEFAULT ARRAY[1,2,3,4,5],
  ADD COLUMN IF NOT EXISTS allow_multiple_per_day BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS require_balance BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_cash NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) NOT NULL DEFAULT 'single';

UPDATE shifts
SET date_from = COALESCE(date_from, date),
    date_to = COALESCE(date_to, date),
    working_days = COALESCE(working_days, ARRAY[EXTRACT(ISODOW FROM date)::INT]),
    schedule_type = CASE
      WHEN date_from IS NOT NULL AND date_to IS NOT NULL AND date_from <> date_to THEN 'range'
      ELSE 'single'
    END
WHERE date IS NOT NULL;

CREATE TABLE IF NOT EXISTS shift_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  shift_date      DATE NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','in_process','completed','closed')),
  opening_balance NUMERIC(10,2) DEFAULT 0,
  closing_cash    NUMERIC(10,2),
  cashier_collection NUMERIC(10,2),
  opened_at       TIMESTAMPTZ DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_sessions_shift_date
  ON shift_sessions(shift_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_restaurant_date
  ON shift_sessions(restaurant_id, shift_date);
CREATE INDEX IF NOT EXISTS idx_shift_sessions_employee_date
  ON shift_sessions(employee_id, shift_date);
