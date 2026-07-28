import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import LoginForm from './LoginForm'

/**
 * AuthGate — wraps the entire app behind Supabase authentication.
 *
 * Behaviour (Requirements 10.1, 10.4):
 * - While the initial session check is in progress, renders a loading indicator.
 * - When no active session exists, renders <LoginForm />.
 * - When a valid session exists (including restored sessions after page refresh),
 *   renders {children}.
 *
 * The component subscribes to `supabase.auth.onAuthStateChange` so that:
 * - A successful login immediately transitions to the main app view.
 * - A sign-out immediately returns to the login form.
 * - An existing session persisted in localStorage is restored automatically on
 *   page reload (Requirement 10.4).
 */
export default function AuthGate({ children }) {
  // null = not yet determined; false = no session; object = active session
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    // Fetch the current session synchronously from the Supabase client cache,
    // then fall back to the async call to handle the initial load reliably.
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession ?? null)
    })

    // Subscribe to future auth state changes (login, logout, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Still waiting for the initial session check.
  if (session === undefined) {
    return (
      <div role="status" aria-live="polite" className="login-wrapper" style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-base)' }}>
        Loading…
      </div>
    )
  }

  // No active session — show the login form.
  if (session === null) {
    return <LoginForm />
  }

  // Active session — render the protected app content.
  return children
}
