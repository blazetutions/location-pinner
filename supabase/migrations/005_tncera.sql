-- Migration 005: TNCERA Clinical Establishments Layer
-- Creates tncera_locations and user_tncera_status tables with RLS.
-- Requirements: 10.1, 10.2, 10.3, 10.4, 8.1–8.6

-- ── tncera_locations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tncera_locations (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  facility_name     TEXT NOT NULL,
  address_text      TEXT NOT NULL,
  tncera_no         TEXT UNIQUE NOT NULL,
  district          TEXT DEFAULT 'Chennai',
  establishment_type TEXT,
  validity_from     TEXT,
  validity_to       TEXT,
  query_text        TEXT NOT NULL UNIQUE,  -- geocoding key / deduplication key
  lat               DOUBLE PRECISION,
  lng               DOUBLE PRECISION,
  geocode_status    TEXT NOT NULL DEFAULT 'pending'
                      CHECK (geocode_status IN ('pending', 'geocoded', 'failed')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tncera_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read tncera locations"
  ON tncera_locations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert tncera locations"
  ON tncera_locations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "update tncera locations"
  ON tncera_locations FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ── user_tncera_status ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tncera_status (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES tncera_locations(id) ON DELETE CASCADE,
  user_id     UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status      TEXT   NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Visited', 'Converted', 'Pending')),
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT user_tncera_status_location_user_key UNIQUE (location_id, user_id)
);

-- Auto-update updated_at on every row update
CREATE OR REPLACE FUNCTION update_tncera_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_user_tncera_status_updated_at
  BEFORE UPDATE ON user_tncera_status
  FOR EACH ROW
  EXECUTE FUNCTION update_tncera_status_updated_at();

ALTER TABLE user_tncera_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own tncera status"
  ON user_tncera_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "insert own tncera status"
  ON user_tncera_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update own tncera status"
  ON user_tncera_status FOR UPDATE
  USING (auth.uid() = user_id);
