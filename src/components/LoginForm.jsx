import { useState } from 'react'
import { supabase } from '../supabaseClient'

/**
 * LoginForm — handles email/password sign-in and sign-up via Supabase Auth.
 *
 * Behaviour (Requirements 10.2, 10.3):
 * - Calls supabase.auth.signInWithPassword on submit.
 * - On success, AuthGate detects the new session via onAuthStateChange and
 *   transitions to the main app view automatically — no prop callback needed.
 * - On failure, the Supabase error message is shown inline and the user
 *   remains on this screen.
 * - A toggle lets the user switch to sign-up mode, which calls supabase.auth.signUp.
 */
export default function LoginForm() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (authError) {
          // Requirement 10.3: show error, do NOT advance to main view
          setError(authError.message)
        }
        // On success, AuthGate's onAuthStateChange listener fires and
        // renders children — no further action needed here.
      } else {
        // Sign-up mode
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (signUpError) {
          setError(signUpError.message)
        } else {
          setInfo(
            'Account created. Check your email to confirm your address, then sign in.'
          )
          setMode('login')
          setPassword('')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'))
    setError(null)
    setInfo(null)
    setPassword('')
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        {/* Header */}
        <h1 style={styles.title}>TN Health Map</h1>
        <h2 style={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
        </h2>

        {/* Error message — Requirement 10.3 */}
        {error && (
          <div role="alert" aria-live="assertive" style={styles.error}>
            {error}
          </div>
        )}

        {/* Informational message (post-signup) */}
        {info && (
          <div role="status" aria-live="polite" style={styles.info}>
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          <div style={styles.field}>
            <label htmlFor="lf-email" style={styles.label}>
              Email address
            </label>
            <input
              id="lf-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              style={styles.input}
              placeholder="you@example.com"
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="lf-password" style={styles.label}>
              Password
            </label>
            <input
              id="lf-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              style={styles.input}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              ...styles.submitButton,
              opacity: loading || !email || !password ? 0.6 : 1,
              cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? mode === 'login'
                ? 'Signing in…'
                : 'Creating account…'
              : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          </button>
        </form>

        {/* Toggle between login and sign-up */}
        <p style={styles.toggleText}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={toggleMode}
            disabled={loading}
            style={styles.toggleLink}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── Inline styles ────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#f1f5f9',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: '1rem',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '0.75rem',
    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
  },
  title: {
    margin: '0 0 0.25rem',
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    margin: '0 0 1.5rem',
    fontSize: '1rem',
    fontWeight: '400',
    color: '#475569',
    textAlign: 'center',
  },
  error: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fca5a5',
    borderRadius: '0.5rem',
    color: '#b91c1c',
    fontSize: '0.875rem',
    padding: '0.75rem 1rem',
    marginBottom: '1.25rem',
  },
  info: {
    backgroundColor: '#f0fdf4',
    border: '1px solid #86efac',
    borderRadius: '0.5rem',
    color: '#166534',
    fontSize: '0.875rem',
    padding: '0.75rem 1rem',
    marginBottom: '1.25rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  label: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: '#374151',
  },
  input: {
    border: '1px solid #d1d5db',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    padding: '0.625rem 0.75rem',
    outline: 'none',
    transition: 'border-color 0.15s',
    width: '100%',
    boxSizing: 'border-box',
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  submitButton: {
    marginTop: '0.5rem',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    padding: '0.75rem 1rem',
    width: '100%',
    transition: 'background-color 0.15s',
  },
  toggleText: {
    marginTop: '1.25rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: '#6b7280',
  },
  toggleLink: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '0.875rem',
    padding: 0,
    textDecoration: 'underline',
  },
}
