-- Migration 003: user_roles table with RLS
-- Requirements: 16.1, 16.2

CREATE TABLE IF NOT EXISTS user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'user'
               CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own role row
-- Requirement 16.2 — user can only SELECT the row where user_id = auth.uid()
CREATE POLICY "select own role"
  ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy for regular users.
-- Role writes are performed by the assign_role function (SECURITY DEFINER)
-- or directly by the service role key from the Supabase dashboard.
