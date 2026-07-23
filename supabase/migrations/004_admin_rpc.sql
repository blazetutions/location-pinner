-- Migration 004: Admin RPC functions for data export and location reset
-- Requirements: 16.11, 16.12
--
-- Both functions are SECURITY DEFINER so they execute with the privileges of
-- their definer (service role), bypassing RLS on the underlying tables.
-- Access is restricted to admins via an explicit is_admin() guard in the
-- function body.  search_path is pinned to 'public' to prevent search-path
-- injection attacks.
--
-- Depends on: 003b_admin_functions.sql (is_admin())

-- ---------------------------------------------------------------------------
-- export_all_statuses()
-- Returns every row in user_location_status regardless of the calling user.
-- Requirement 16.11: admin "Export All Data" bypasses per-user RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION export_all_statuses()
RETURNS SETOF user_location_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  RETURN QUERY SELECT * FROM user_location_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- reset_locations()
-- Deletes all rows from the locations table, enabling a fresh upload and
-- geocoding pass.
-- Requirement 16.12: admin "Reset Location Data" clears the locations table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_locations()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;
  DELETE FROM locations;
END;
$$;
