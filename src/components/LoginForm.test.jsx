import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginForm from './LoginForm'

// ---------------------------------------------------------------------------
// Mock the Supabase client — no real network calls in unit tests.
// ---------------------------------------------------------------------------

const mockSignIn = vi.fn()
const mockSignUp = vi.fn()

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args) => mockSignIn(...args),
      signUp: (...args) => mockSignUp(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillAndSubmit(email, password) {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: email },
  })
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: /sign in|create account/i }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders email and password inputs and a submit button', () => {
    render(<LoginForm />)

    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders the sign-in heading in login mode', () => {
    render(<LoginForm />)
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument()
  })

  it('disables the submit button when fields are empty', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDisabled()
  })

  it('enables the submit button once email and password are both filled', () => {
    render(<LoginForm />)

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'user@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'secret123' },
    })

    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled()
  })

  // ── Login — success (Requirement 10.2) ───────────────────────────────────

  it('calls signInWithPassword with the entered credentials on submit', async () => {
    mockSignIn.mockResolvedValue({ error: null })
    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit('user@example.com', 'secret123')
    })

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'secret123',
    })
  })

  it('does not show an error banner when login succeeds', async () => {
    mockSignIn.mockResolvedValue({ error: null })
    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit('user@example.com', 'secret123')
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ── Login — failure (Requirement 10.3) ───────────────────────────────────

  it('displays the Supabase error message when credentials are invalid', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit('bad@example.com', 'wrongpassword')
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials')
  })

  it('remains on the login form after a failed login attempt', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit('bad@example.com', 'wrongpassword')
    })

    // The sign-in heading should still be present — we haven't navigated away.
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument()
  })

  // ── Mode toggle (sign-up) ─────────────────────────────────────────────────

  it('switches to sign-up mode when the toggle link is clicked', () => {
    render(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    expect(screen.getByText(/create an account/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('calls signUp with the entered credentials in sign-up mode', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    render(<LoginForm />)

    // Switch to sign-up mode
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'new@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'newpassword' },
      })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    })

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'newpassword',
    })
  })

  it('shows a confirmation message and returns to login mode after successful sign-up', async () => {
    mockSignUp.mockResolvedValue({ error: null })
    render(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'new@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'newpassword' },
      })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    })

    // Should display the confirmation info message
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/check your email/i)
    })
    // Should have returned to login mode
    expect(screen.getByText(/sign in to your account/i)).toBeInTheDocument()
  })

  it('displays a sign-up error when signUp returns an error', async () => {
    mockSignUp.mockResolvedValue({ error: { message: 'User already registered' } })
    render(<LoginForm />)

    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'existing@example.com' },
      })
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'password123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /create account/i }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('User already registered')
  })

  // ── Clears error when toggling mode ──────────────────────────────────────

  it('clears any error message when the user toggles between modes', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit('bad@example.com', 'wrong')
    })

    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Toggle to sign-up clears the error
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
