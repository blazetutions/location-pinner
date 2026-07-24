-- Migration 005: TNCERA Clinical Establishments Layer
-- Creates tncera_locations and user_tncera_status tables with RLS.

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tncera_locations (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_name      TEXT        NOT NULL,
  address_text       TEXT        NOT NULL,
  tncera_no          TEXT        UNIQUE NOT NULL,
  district           TEXT,
  establishment_type TEXT,
  validity_from      TEXT,
  validity_to        TEXT,
  query_text         TEXT        UNIQUE NOT NULL,
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,
  geocode_status     TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (geocode_status IN ('pending', 'geocoded', 'failed')),
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_tncera_status (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID        NOT NULL REFERENCES tncera_locations(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL CHECK (status IN ('Visited', 'Converted', 'Pending')),
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT user_tncera_status_location_user_key UNIQUE (location_id, user_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE tncera_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tncera_status ENABLE ROW LEVEL SECURITY;

-- tncera_locations: all authenticated users can read and write
DROP POLICY IF EXISTS "tncera_locations_select_authenticated" ON tncera_locations;
CREATE POLICY "tncera_locations_select_authenticated"
  ON tncera_locations FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "tncera_locations_insert_authenticated" ON tncera_locations;
CREATE POLICY "tncera_locations_insert_authenticated"
  ON tncera_locations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "tncera_locations_update_authenticated" ON tncera_locations;
CREATE POLICY "tncera_locations_update_authenticated"
  ON tncera_locations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- user_tncera_status: users can only access their own rows
DROP POLICY IF EXISTS "user_tncera_status_select_own" ON user_tncera_status;
CREATE POLICY "user_tncera_status_select_own"
  ON user_tncera_status FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tncera_status_insert_own" ON user_tncera_status;
CREATE POLICY "user_tncera_status_insert_own"
  ON user_tncera_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_tncera_status_update_own" ON user_tncera_status;
CREATE POLICY "user_tncera_status_update_own"
  ON user_tncera_status FOR UPDATE
  USING (auth.uid() = user_id);
