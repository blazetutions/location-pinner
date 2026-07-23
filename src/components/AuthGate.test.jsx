import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AuthGate from './AuthGate'

// ---------------------------------------------------------------------------
// Mock the Supabase client so tests run without real network calls.
// ---------------------------------------------------------------------------

const mockUnsubscribe = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockGetSession = vi.fn()

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...args) => mockGetSession(...args),
      onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
    },
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sets up the Supabase auth mocks:
 *  - getSession resolves to `session` (null = no session, object = active)
 *  - onAuthStateChange stores the callback so tests can fire auth events,
 *    and returns the subscription object required by the component.
 */
function setupAuthMocks(session, { triggerStateChange } = {}) {
  mockGetSession.mockResolvedValue({ data: { session } })

  mockOnAuthStateChange.mockImplementation((callback) => {
    // Optionally allow the test to fire a state change after mount.
    if (triggerStateChange) triggerStateChange(callback)
    return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Requirement 10.1 — no session → show login form, block main view
  it('renders the login form when there is no active session', async () => {
    setupAuthMocks(null)

    render(
      <AuthGate>
        <div data-testid="main-app">Main App</div>
      </AuthGate>
    )

    // Wait for the async getSession call to resolve.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    // LoginForm should be visible — check for the sign-in heading.
    expect(screen.getByText(/Sign in to your account/i)).toBeInTheDocument()
    // Main app must NOT be rendered.
    expect(screen.queryByTestId('main-app')).not.toBeInTheDocument()
  })

  // Requirement 10.4 — existing session → render children directly
  it('renders children when a valid session already exists', async () => {
    const fakeSession = { user: { id: 'user-123', email: 'test@example.com' } }
    setupAuthMocks(fakeSession)

    render(
      <AuthGate>
        <div data-testid="main-app">Main App</div>
      </AuthGate>
    )

    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument()
    })

    // Login form must NOT be rendered when authenticated.
    expect(screen.queryByText(/Sign in to your account/i)).not.toBeInTheDocument()
  })

  // Loading state — before the initial session check resolves
  it('shows a loading indicator while the session check is in progress', () => {
    // Return a promise that never resolves to keep the component in the loading state.
    mockGetSession.mockReturnValue(new Promise(() => {}))
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })

    render(
      <AuthGate>
        <div data-testid="main-app">Main App</div>
      </AuthGate>
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
    expect(screen.queryByTestId('main-app')).not.toBeInTheDocument()
  })

  // Requirement 10.4 — onAuthStateChange fires with a session → show main app
  it('transitions to the main app when onAuthStateChange fires with a session', async () => {
    // getSession returns null initially.
    mockGetSession.mockResolvedValue({ data: { session: null } })

    let capturedCallback = null
    mockOnAuthStateChange.mockImplementation((callback) => {
      capturedCallback = callback
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    render(
      <AuthGate>
        <div data-testid="main-app">Main App</div>
      </AuthGate>
    )

    // Wait until the component is in the "no session" state.
    await waitFor(() => {
      expect(screen.getByText(/Sign in to your account/i)).toBeInTheDocument()
    })

    // Simulate a login event via onAuthStateChange.
    const fakeSession = { user: { id: 'user-123' } }
    capturedCallback('SIGNED_IN', fakeSession)

    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Sign in to your account/i)).not.toBeInTheDocument()
  })

  // Sign-out via onAuthStateChange → return to login form
  it('returns to the login form when onAuthStateChange fires with null session', async () => {
    const fakeSession = { user: { id: 'user-123' } }
    mockGetSession.mockResolvedValue({ data: { session: fakeSession } })

    let capturedCallback = null
    mockOnAuthStateChange.mockImplementation((callback) => {
      capturedCallback = callback
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    render(
      <AuthGate>
        <div data-testid="main-app">Main App</div>
      </AuthGate>
    )

    // Wait until the main app is rendered.
    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument()
    })

    // Simulate sign-out.
    capturedCallback('SIGNED_OUT', null)

    await waitFor(() => {
      expect(screen.getByText(/Sign in to your account/i)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('main-app')).not.toBeInTheDocument()
  })

  // Cleanup — subscription must be unsubscribed on unmount
  it('unsubscribes from auth state changes on unmount', async () => {
    setupAuthMocks(null)

    const { unmount } = render(
      <AuthGate>
        <div>App</div>
      </AuthGate>
    )

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
