-- ═══════════════════════════════════════════════════════════════════════════════
-- 002_attendance.sql  — Time & Attendance Module (RestaurantOS Premium Add-on)
-- Run once per database. Safe to re-run (uses IF NOT EXISTS / CREATE EXTENSION).
-- ═══════════════════════════════════════════════════════════════════════════════

-- Required for leave overlap exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Overtime Rules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overtime_rules (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name                  VARCHAR(100) NOT NULL DEFAULT 'Default',
  daily_regular_hours   DECIMAL(4,2) NOT NULL DEFAULT 8.00,
  ot_multiplier         DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  holiday_multiplier    DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  ot_threshold_min      INT NOT NULL DEFAULT 30,
  ot_rounding_min       INT NOT NULL DEFAULT 15,
  is_default            BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_rules_default
  ON overtime_rules(restaurant_id) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_ot_rules_restaurant ON overtime_rules(restaurant_id);

-- ── Holidays ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS att_holidays (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  date          DATE NOT NULL,
  type          VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (type IN ('full','half')),
  is_paid       BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, date, name)
);
CREATE INDEX IF NOT EXISTS idx_holidays_restaurant_date ON att_holidays(restaurant_id, date);

-- ── Leave Requests ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type      VARCHAR(30) NOT NULL CHECK (leave_type IN ('annual','sick','unpaid','emergency','compensatory')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  duration_type   VARCHAR(20) NOT NULL DEFAULT 'full' CHECK (duration_type IN ('full','half_am','half_pm')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason          TEXT,
  approved_by     UUID REFERENCES employees(id),
  approved_at     TIMESTAMPTZ,
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaves_employee    ON leaves(employee_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leaves_restaurant  ON leaves(restaurant_id, status);

-- ── Raw Attendance Logs (punch events) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id        UUID REFERENCES shifts(id),
  log_type        VARCHAR(20) NOT NULL CHECK (log_type IN ('clock_in','clock_out','break_start','break_end')),
  punched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attendance_date DATE NOT NULL,
  source          VARCHAR(20) NOT NULL DEFAULT 'web' CHECK (source IN ('web','manual','kiosk','mobile','api')),
  device_id       VARCHAR(100),
  latitude        DECIMAL(9,6),
  longitude       DECIMAL(9,6),
  notes           TEXT,
  is_voided       BOOLEAN NOT NULL DEFAULT FALSE,
  voided_by       UUID REFERENCES employees(id),
  voided_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES employees(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_att_logs_employee_date    ON attendance_logs(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_att_logs_restaurant_date  ON attendance_logs(restaurant_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_att_logs_punched_at       ON attendance_logs(punched_at DESC);

-- ── Daily Attendance Summary (computed) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_attendance (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id       UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id            UUID REFERENCES shifts(id),
  attendance_date     DATE NOT NULL,
  clock_in_at         TIMESTAMPTZ,
  clock_out_at        TIMESTAMPTZ,
  scheduled_minutes   INT,
  worked_minutes      INT NOT NULL DEFAULT 0,
  break_minutes       INT NOT NULL DEFAULT 0,
  late_minutes        INT NOT NULL DEFAULT 0,
  early_exit_minutes  INT NOT NULL DEFAULT 0,
  ot_minutes          INT NOT NULL DEFAULT 0,
  status              VARCHAR(30) NOT NULL DEFAULT 'absent' CHECK (status IN (
                        'present','absent','late','half_day','on_leave','holiday','weekend','on_leave_holiday'
                      )),
  leave_id            UUID REFERENCES leaves(id),
  holiday_id          UUID REFERENCES att_holidays(id),
  ot_rule_id          UUID REFERENCES overtime_rules(id),
  is_corrected        BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  computed_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_att_restaurant_date ON daily_attendance(restaurant_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_daily_att_employee        ON daily_attendance(employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_att_status          ON daily_attendance(restaurant_id, status, attendance_date);

-- ── Attendance Corrections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id         UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  daily_attendance_id   UUID REFERENCES daily_attendance(id),
  employee_id           UUID NOT NULL REFERENCES employees(id),
  requested_by          UUID REFERENCES employees(id),
  approved_by           UUID REFERENCES employees(id),
  status                VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  attendance_date       DATE NOT NULL,
  original_clock_in     TIMESTAMPTZ,
  original_clock_out    TIMESTAMPTZ,
  corrected_clock_in    TIMESTAMPTZ,
  corrected_clock_out   TIMESTAMPTZ,
  original_status       VARCHAR(30),
  corrected_status      VARCHAR(30),
  reason                TEXT NOT NULL,
  rejection_note        TEXT,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corrections_restaurant ON attendance_corrections(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_employee   ON attendance_corrections(employee_id, created_at DESC);

-- ── Triggers (reuse existing update_updated_at function) ──────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_overtime_rules_updated') THEN
    CREATE TRIGGER trg_overtime_rules_updated BEFORE UPDATE ON overtime_rules
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leaves_updated') THEN
    CREATE TRIGGER trg_leaves_updated BEFORE UPDATE ON leaves
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_daily_att_updated') THEN
    CREATE TRIGGER trg_daily_att_updated BEFORE UPDATE ON daily_attendance
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_corrections_updated') THEN
    CREATE TRIGGER trg_corrections_updated BEFORE UPDATE ON attendance_corrections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
