-- Migration 003b: admin helper functions
-- Requirements: 16.2, 16.3

-- is_admin()
-- Returns TRUE when the calling user has role = 'admin' in user_roles.
-- SECURITY DEFINER so it can query user_roles regardless of the caller's RLS
-- context; search_path is pinned to 'public' to prevent search-path injection.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

-- assign_role(target_user_id, new_role)
-- Allows an admin to upsert a role for any user.
-- Raises an exception if the caller is not an admin or if new_role is invalid.
CREATE OR REPLACE FUNCTION assign_role(target_user_id UUID, new_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can assign roles';
  END IF;
  IF new_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role: must be admin or user';
  END IF;
  INSERT INTO user_roles (user_id, role)
  VALUES (target_user_id, new_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
