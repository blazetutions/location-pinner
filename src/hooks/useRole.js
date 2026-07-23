import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

/**
 * useRole — reads the current user's role from the `user_roles` table.
 *
 * Returns { role, isAdmin, loading } where:
 *  - role:    the user's role string, or 'user' as the default when no row exists
 *  - isAdmin: true iff role === 'admin'
 *  - loading: true while the initial fetch (or a re-fetch) is in progress
 *
 * Re-fetches automatically whenever the Supabase auth state changes, and
 * unsubscribes from the auth listener on unmount (Requirement 16.4).
 */
export function useRole() {
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchRole() {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', (await supabase.auth.getUser()).data?.user?.id)
      .maybeSingle()

    if (error || !data) {
      // Default to 'user' for new users who have no row yet.
      setRole('user')
    } else {
      setRole(data.role)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRole()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchRole()
    })

    return () => {
      subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { role, isAdmin: role === 'admin', loading }
}
