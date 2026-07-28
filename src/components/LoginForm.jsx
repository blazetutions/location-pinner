import { useState } from 'react'
import { supabase } from '../supabaseClient'

export default function LoginForm() {
  const [mode, setMode] = useState('login')
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
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
        if (authError) setError(authError.message)
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) {
          setError(signUpError.message)
        } else {
          setInfo('Account created. Check your email to confirm your address, then sign in.')
          setMode('login')
          setPassword('')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode(prev => prev === 'login' ? 'signup' : 'login')
    setError(null)
    setInfo(null)
    setPassword('')
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h1 className="login-title">TN Health Map</h1>
        <h2 className="login-subtitle">
          {mode === 'login' ? 'Sign in to your account' : 'Create an account'}
        </h2>

        {error && (
          <div role="alert" aria-live="assertive" className="login-alert">
            {error}
          </div>
        )}

        {info && (
          <div role="status" aria-live="polite" className="login-info">
            {info}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="login-form">
          <div className="login-field">
            <label htmlFor="lf-email" className="login-label">Email address</label>
            <input
              id="lf-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              className="login-input"
              placeholder="you@example.com"
            />
          </div>

          <div className="login-field">
            <label htmlFor="lf-password" className="login-label">Password</label>
            <input
              id="lf-password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              className="login-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="login-submit"
          >
            {loading
              ? mode === 'login' ? 'Signing in…' : 'Creating account…'
              : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="login-toggle-text">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" onClick={toggleMode} disabled={loading} className="login-toggle-link">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
