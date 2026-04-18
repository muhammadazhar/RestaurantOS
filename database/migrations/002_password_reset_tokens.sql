CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_employee
  ON password_reset_tokens(employee_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens(token_hash);
