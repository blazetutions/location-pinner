import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRole } from './useRole'

// ---------------------------------------------------------------------------
// Mock the Supabase client
// ---------------------------------------------------------------------------

const mockUnsubscribe = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockMaybeSingle = vi.fn()
const mockGetUser = vi.fn()

// Build a chainable query builder stub
function makeQueryBuilder() {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: (...args) => mockMaybeSingle(...args),
  }
  return builder
}

const mockFrom = vi.fn()

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: (...args) => mockGetUser(...args),
      onAuthStateChange: (...args) => mockOnAuthStateChange(...args),
    },
    from: (...args) => mockFrom(...args),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up the standard auth and DB mocks for each test.
 *
 * @param {object|null} dbRow   - Row returned by maybeSingle, or null for "no row".
 * @param {boolean}     dbError - Whether maybeSingle returns an error.
 */
function setupMocks(dbRow, { dbError = false } = {}) {
  // Stable user id
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } } })

  // Chainable .from().select().eq().maybeSingle()
  mockFrom.mockReturnValue(makeQueryBuilder())

  if (dbError) {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error('db error') })
  } else {
    mockMaybeSingle.mockResolvedValue({ data: dbRow, error: null })
  }

  // onAuthStateChange — store callback, return subscription
  mockOnAuthStateChange.mockImplementation(() => ({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Requirement 16.4 — admin row → role='admin', isAdmin=true
  it('returns role="admin" and isAdmin=true when DB returns admin', async () => {
    setupMocks({ role: 'admin' })

    const { result } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('admin')
    expect(result.current.isAdmin).toBe(true)
  })

  // Requirement 16.4 — user row → role='user', isAdmin=false
  it('returns role="user" and isAdmin=false when DB returns user role', async () => {
    setupMocks({ role: 'user' })

    const { result } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('user')
    expect(result.current.isAdmin).toBe(false)
  })

  // Requirement 16.4 — no row in DB → defaults to role='user'
  it('defaults role to "user" when no row exists for the current user', async () => {
    setupMocks(null) // maybeSingle returns { data: null, error: null }

    const { result } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('user')
    expect(result.current.isAdmin).toBe(false)
  })

  // Requirement 16.4 — defaults to 'user' on DB error too
  it('defaults role to "user" when the DB query returns an error', async () => {
    setupMocks(null, { dbError: true })

    const { result } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('user')
    expect(result.current.isAdmin).toBe(false)
  })

  // Requirement 16.4 — loading=true initially, false after fetch resolves
  it('starts with loading=true and sets loading=false after fetch completes', async () => {
    // Create the deferred promise before rendering so it is ready when
    // fetchRole calls maybeSingle (which happens after the awaited getUser).
    let resolveQuery
    const queryPromise = new Promise((res) => { resolveQuery = res })

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } } })
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: () => queryPromise,
    })
    mockOnAuthStateChange.mockImplementation(() => ({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    }))

    const { result } = renderHook(() => useRole())

    // Should be loading immediately after mount
    expect(result.current.loading).toBe(true)

    // Resolve the pending query
    resolveQuery({ data: { role: 'user' }, error: null })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe('user')
  })

  // Requirement 16.4 — re-fetches when auth state changes
  it('re-fetches role when onAuthStateChange fires', async () => {
    // First fetch: admin
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-abc' } } })
    mockFrom.mockReturnValue(makeQueryBuilder())
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })

    let capturedAuthCallback = null
    mockOnAuthStateChange.mockImplementation((callback) => {
      capturedAuthCallback = callback
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })

    const { result } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.role).toBe('admin')

    // Simulate auth state change — second fetch returns 'user'
    mockFrom.mockReturnValue(makeQueryBuilder())
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'user' }, error: null })

    capturedAuthCallback('SIGNED_IN', { user: { id: 'user-xyz' } })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.role).toBe('user')
    })
    expect(result.current.isAdmin).toBe(false)
  })

  // Cleanup — unsubscribes from auth listener on unmount
  it('unsubscribes from the auth listener on unmount', async () => {
    setupMocks({ role: 'user' })

    const { result, unmount } = renderHook(() => useRole())

    await waitFor(() => expect(result.current.loading).toBe(false))

    unmount()

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })
})
