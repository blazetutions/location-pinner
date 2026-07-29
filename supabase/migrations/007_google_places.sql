-- Migration 007: Google Places matching support
-- Adds geocode_source, google_place_id, needs_review status,
-- duplicate-detection tracking, and async job table.

-- ── 1. Extend tncera_locations ───────────────────────────────────────────────

-- Widen geocode_status CHECK to include 'needs_review'
ALTER TABLE tncera_locations
  DROP CONSTRAINT IF EXISTS tncera_locations_geocode_status_check;

ALTER TABLE tncera_locations
  ADD CONSTRAINT tncera_locations_geocode_status_check
    CHECK (geocode_status IN ('pending', 'geocoded', 'failed', 'needs_review'));

-- Source of the geocode result
ALTER TABLE tncera_locations
  ADD COLUMN IF NOT EXISTS geocode_source TEXT
    CHECK (geocode_source IN ('google_places', 'nominatim', NULL));

-- Google Places place ID (stable identifier for the matched place)
ALTER TABLE tncera_locations
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- Candidate data surfaced for admin review (JSONB so the UI can render it)
ALTER TABLE tncera_locations
  ADD COLUMN IF NOT EXISTS review_candidate JSONB;

-- ── 2. Duplicate-pair tracking ───────────────────────────────────────────────
-- Records a resolved determination between two tncera_locations rows
-- that were flagged as potential duplicates. Persisted so the pair is not
-- re-prompted on future runs.

CREATE TABLE IF NOT EXISTS tncera_duplicate_resolutions (
  id           UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  row_a_id     UUID      NOT NULL REFERENCES tncera_locations(id) ON DELETE CASCADE,
  row_b_id     UUID      NOT NULL REFERENCES tncera_locations(id) ON DELETE CASCADE,
  -- 'skip_matching': treat as duplicate, skip Google Places matching for this pair
  -- 'not_duplicate': treat as distinct, allow both to proceed through matching
  resolution   TEXT      NOT NULL CHECK (resolution IN ('skip_matching', 'not_duplicate')),
  resolved_by  UUID      REFERENCES auth.users(id),
  resolved_at  TIMESTAMPTZ DEFAULT now(),
  -- Canonical ordering: always store smaller UUID as row_a so the pair is unique
  CONSTRAINT tncera_duplicate_resolutions_pair_unique UNIQUE (row_a_id, row_b_id)
);

ALTER TABLE tncera_duplicate_resolutions ENABLE ROW LEVEL SECURITY;

-- Admins (authenticated users) can read and write resolutions
DROP POLICY IF EXISTS "dup_resolutions_select" ON tncera_duplicate_resolutions;
CREATE POLICY "dup_resolutions_select"
  ON tncera_duplicate_resolutions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "dup_resolutions_insert" ON tncera_duplicate_resolutions;
CREATE POLICY "dup_resolutions_insert"
  ON tncera_duplicate_resolutions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "dup_resolutions_update" ON tncera_duplicate_resolutions;
CREATE POLICY "dup_resolutions_update"
  ON tncera_duplicate_resolutions FOR UPDATE
  USING (auth.role() = 'authenticated');

-- ── 3. Async job table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS google_places_match_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status              TEXT        NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'running', 'done', 'failed')),
  total_rows          INTEGER     DEFAULT 0,
  processed_rows      INTEGER     DEFAULT 0,
  matched_count       INTEGER     DEFAULT 0,
  needs_review_count  INTEGER     DEFAULT 0,
  no_match_count      INTEGER     DEFAULT 0,
  error_message       TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ
);

ALTER TABLE google_places_match_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "places_jobs_select" ON google_places_match_jobs;
CREATE POLICY "places_jobs_select"
  ON google_places_match_jobs FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "places_jobs_insert" ON google_places_match_jobs;
CREATE POLICY "places_jobs_insert"
  ON google_places_match_jobs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "places_jobs_update" ON google_places_match_jobs;
CREATE POLICY "places_jobs_update"
  ON google_places_match_jobs FOR UPDATE
  USING (auth.role() = 'authenticated');
