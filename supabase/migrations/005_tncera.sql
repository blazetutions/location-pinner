-- Migration 005: TNCERA Clinical Establishments Layer
-- Creates tncera_locations and user_tncera_status tables with RLS.
-- Requirements: 10.1, 10.2, 10.3, 10.4, 8.1–8.6

-- ── tncera_locations ─────────────────────────────────────────────────────────
-- Requirement 10.1: UUID PK, unique tncera_no and query_text, geocode_status check
CREATE TABLE IF NOT EXISTS tncera_locations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name      TEXT        NOT NULL,
  address_text       TEXT        NOT NULL,
  tncera_no          TEXT        UNIQUE NOT NULL,
  district           TEXT,
  establishment_type TEXT,
  validity_from      TEXT,
  validity_to        TEXT,
  query_text         TEXT        UNIQUE NOT NULL,  -- geocoding key / deduplication key
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  geocode_status     TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (geocode_status IN ('pending', 'geocoded', 'failed')),
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Requirement 8.5, 8.6: Enable RLS, all authenticated users can SELECT/INSERT/UPDATE
ALTER TABLE tncera_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "tncera_locations_select_authenticated"
  ON tncera_locations
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "tncera_locations_insert_authenticated"
  ON tncera_locations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "tncera_locations_update_authenticated"
  ON tncera_locations
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ── user_tncera_status ────────────────────────────────────────────────────────
-- Requirement 10.2: UUID PK, UUID FK → tncera_locations.id, status check, unique (location_id, user_id)
CREATE TABLE IF NOT EXISTS user_tncera_status (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID        NOT NULL REFERENCES tncera_locations(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL
                CHECK (status IN ('Visited', 'Converted', 'Pending')),
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),

  -- Requirement 8.2: at most one row per (location, user) pair
  CONSTRAINT user_tncera_status_location_user_key UNIQUE (location_id, user_id)
);

-- Requirement 8.1–8.4: Enable RLS, users can only access their own rows
ALTER TABLE user_tncera_status ENABLE ROW LEVEL SECURITY;

-- Requirement 8.3, 10.4: SELECT only own rows
CREATE POLICY IF NOT EXISTS "user_tncera_status_select_own"
  ON user_tncera_status
  FOR SELECT
  USING (auth.uid() = user_id);

-- Requirement 8.4, 10.4: INSERT only own rows
CREATE POLICY IF NOT EXISTS "user_tncera_status_insert_own"
  ON user_tncera_status
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Requirement 8.4, 10.4: UPDATE only own rows
CREATE POLICY IF NOT EXISTS "user_tncera_status_update_own"
  ON user_tncera_status
  FOR UPDATE
  USING (auth.uid() = user_id);
