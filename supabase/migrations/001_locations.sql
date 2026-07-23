-- Migration 001: Create locations table with RLS policies
-- Requirements: 9.3, 9.4

-- Shared location cache (geocoded once, reused by all authenticated users)
create table if not exists locations (
  id              bigint generated always as identity primary key,
  district        text,
  zone            text,                        -- e.g. "Chennai North" / "Chennai Central" / "Chennai South"
  block           text,                        -- e.g. "Manali", "Madhavaram"
  phc             text,                        -- Primary Health Centre name
  hsc             text,                        -- Health Sub-Centre name (null for phc-level rows)
  level           text not null
                    check (level in ('phc', 'hsc')),
  query_text      text not null unique,        -- geocoding query / deduplication key
  lat             double precision,            -- WGS84 latitude, null until geocoded
  lng             double precision,            -- WGS84 longitude, null until geocoded
  geocode_level   text,                        -- 'geocoded' | 'phc-fallback' | null
  parent_phc_id   bigint references locations(id) on delete set null,
  created_at      timestamptz default now()
);

-- Enable Row Level Security (Requirement 9.3, 9.4)
alter table locations enable row level security;

-- Policy: authenticated users may SELECT all rows in the shared location cache
-- Requirement 9.3 — authenticated users can read all locations
create policy "locations_select_authenticated"
  on locations
  for select
  using (auth.role() = 'authenticated');

-- Policy: authenticated users may INSERT new location rows
-- Requirement 9.4 — authenticated users can insert locations
create policy "locations_insert_authenticated"
  on locations
  for insert
  with check (auth.role() = 'authenticated');

-- Policy: authenticated users may UPDATE existing location rows
-- Requirement 9.4 — authenticated users can update locations (e.g. geocoding pass)
create policy "locations_update_authenticated"
  on locations
  for update
  using (auth.role() = 'authenticated');
