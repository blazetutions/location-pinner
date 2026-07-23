-- Migration: 002_user_location_status
-- Creates the per-user visit status table with RLS policies.
-- Requirements: 8.2, 9.1, 9.2

-- 1. Create table
CREATE TABLE IF NOT EXISTS user_location_status (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  user_id     UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT   NOT NULL DEFAULT 'Not Visited'
                CHECK (status IN ('Visited', 'Not Visited', 'Follow-up Needed')),
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Requirement 8.2: at most one row per (location, user) pair
  CONSTRAINT user_location_status_location_user_key UNIQUE (location_id, user_id)
);

-- Auto-update updated_at on every row update
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_user_location_status_updated_at
  BEFORE UPDATE ON user_location_status
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 2. Enable Row Level Security
ALTER TABLE user_location_status ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies — users can only access their own rows
-- Requirement 9.1: SELECT only own rows
CREATE POLICY "select own status"
  ON user_location_status
  FOR SELECT
  USING (auth.uid() = user_id);

-- Requirement 9.2: INSERT only own rows
CREATE POLICY "insert own status"
  ON user_location_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Requirement 9.2: UPDATE only own rows
CREATE POLICY "update own status"
  ON user_location_status
  FOR UPDATE
  USING (auth.uid() = user_id);
