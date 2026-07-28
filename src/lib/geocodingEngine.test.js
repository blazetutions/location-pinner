import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { geocodeWithRetry, sleep } from './geocodingEngine.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock fetch response that returns a non-empty Nominatim result. */
function makeSuccessResponse(lat = '13.0827', lon = '80.2707') {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([{ lat, lon }]),
  })
}

/** Build a mock fetch response that returns an empty Nominatim result array. */
function makeEmptyResponse() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
  })
}

/** Build a mock fetch response for HTTP 429. */
function make429Response() {
  return Promise.resolve({
    ok: false,
    status: 429,
    json: () => Promise.resolve(null),
  })
}

/**
 * Returns a mock fetch implementation that rejects with a network error.
 * Using a function (rather than a pre-created rejected promise) ensures
 * the rejection is only created when fetch() is actually called, which
 * prevents Vitest from reporting spurious "unhandled rejection" warnings.
 */
function makeNetworkError() {
  return () => Promise.reject(new TypeError('Failed to fetch'))
}

// ---------------------------------------------------------------------------
// Setup: replace global fetch and fake timers
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sleep', () => {
  it('resolves after the specified delay', async () => {
    const promise = sleep(1000)
    vi.advanceTimersByTime(1000)
    await expect(promise).resolves.toBeUndefined()
  })
})

describe('geocodeWithRetry', () => {
  describe('successful response', () => {
    it('returns { lat, lng } when Nominatim returns a non-empty result', async () => {
      fetch.mockReturnValueOnce(makeSuccessResponse('13.0827', '80.2707'))

      const result = await geocodeWithRetry('Adyar PHC, Adyar, Chennai, Tamil Nadu, India')

      expect(result).toEqual({ lat: 13.0827, lng: 80.2707 })
    })

    it('sends the correct Nominatim URL with encoded query parameter', async () => {
      fetch.mockReturnValueOnce(makeSuccessResponse())

      await geocodeWithRetry('Adyar PHC, Chennai')

      const calledUrl = fetch.mock.calls[0][0]
      expect(calledUrl).toContain('nominatim.openstreetmap.org/search')
      expect(calledUrl).toContain('format=json')
      expect(calledUrl).toContain('limit=1')
      expect(calledUrl).toContain(encodeURIComponent('Adyar PHC, Chennai'))
    })

    it('does not pass a User-Agent header (browsers forbid it; identification is via email param)', async () => {
      fetch.mockReturnValueOnce(makeSuccessResponse())

      await geocodeWithRetry('Some Address')

      // fetch should be called with only the URL (no second options argument
      // containing headers), since User-Agent is a forbidden header in Fetch spec
      const callArgs = fetch.mock.calls[0]
      expect(callArgs).toHaveLength(1)
    })
  })

  describe('empty result (address not resolvable)', () => {
    it('returns null on empty results without retrying', async () => {
      fetch.mockReturnValueOnce(makeEmptyResponse())

      const result = await geocodeWithRetry('Nonexistent Address XYZ 99999')

      expect(result).toBeNull()
      // fetch should have been called exactly once — no retry
      expect(fetch).toHaveBeenCalledTimes(1)
    })

    it('does not wait before returning null on empty results', async () => {
      fetch.mockReturnValueOnce(makeEmptyResponse())

      const promise = geocodeWithRetry('Unknown Address')
      // Do NOT advance timers — if there were a retry delay the promise
      // would still be pending.
      const result = await promise

      expect(result).toBeNull()
    })
  })

  describe('network error handling', () => {
    it('retries once on network error and returns result if retry succeeds', async () => {
      fetch
        .mockImplementationOnce(makeNetworkError())
        .mockReturnValueOnce(makeSuccessResponse('12.9716', '77.5946'))

      const promise = geocodeWithRetry('Some Address')
      // Advance past the 2-second retry delay
      await vi.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result).toEqual({ lat: 12.9716, lng: 77.5946 })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('returns null after all retries fail with network error', async () => {
      // maxRetries=3 → 4 attempts total with backoff: 2s, 4s, 8s
      fetch
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())

      const promise = geocodeWithRetry('Some Address')
      // Advance past exponential backoff: 2s + 4s + 8s = 14s
      await vi.advanceTimersByTimeAsync(14000)
      const result = await promise

      expect(result).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(4)
    })

    it('waits 2000ms before retrying on network error', async () => {
      fetch
        .mockImplementationOnce(makeNetworkError())
        .mockReturnValueOnce(makeSuccessResponse())

      const promise = geocodeWithRetry('Some Address')

      // Before 2 s, only the first call should have been made
      expect(fetch).toHaveBeenCalledTimes(1)

      // Advance to just before the retry fires
      await vi.advanceTimersByTimeAsync(1999)
      expect(fetch).toHaveBeenCalledTimes(1)

      // Advance past the threshold
      await vi.advanceTimersByTimeAsync(1)
      await promise

      expect(fetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('HTTP 429 handling', () => {
    it('retries once on HTTP 429 and returns result if retry succeeds', async () => {
      fetch
        .mockReturnValueOnce(make429Response())
        .mockReturnValueOnce(makeSuccessResponse('13.0827', '80.2707'))

      const promise = geocodeWithRetry('Some Address')
      await vi.advanceTimersByTimeAsync(2000)
      const result = await promise

      expect(result).toEqual({ lat: 13.0827, lng: 80.2707 })
      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('returns rate-limited after all retries fail with 429', async () => {
      // maxRetries=3 → 4 attempts total
      fetch
        .mockReturnValueOnce(make429Response())
        .mockReturnValueOnce(make429Response())
        .mockReturnValueOnce(make429Response())
        .mockReturnValueOnce(make429Response())

      const promise = geocodeWithRetry('Some Address')
      await vi.advanceTimersByTimeAsync(14000)
      const result = await promise

      expect(result).toBe('rate-limited')
      expect(fetch).toHaveBeenCalledTimes(4)
    })

    it('does not pass User-Agent on retry requests either', async () => {
      fetch
        .mockReturnValueOnce(make429Response())
        .mockReturnValueOnce(makeSuccessResponse())

      const promise = geocodeWithRetry('Some Address')
      await vi.advanceTimersByTimeAsync(2000)
      await promise

      // No call should have a headers options object
      for (const call of fetch.mock.calls) {
        expect(call).toHaveLength(1)
      }
    })
  })

  describe('error safety — never throws', () => {
    it('does not throw when fetch rejects', async () => {
      // maxRetries=3 → 4 attempts total, advance past all backoff
      fetch
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())
        .mockImplementationOnce(makeNetworkError())

      const promise = geocodeWithRetry('Bad Address')
      await vi.advanceTimersByTimeAsync(14000)

      await expect(promise).resolves.toBeNull()
    })

    it('does not throw when fetch resolves with an unexpected non-array body', async () => {
      fetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ unexpected: 'object' }),
        })
      )

      await expect(geocodeWithRetry('Some Address')).resolves.toBeNull()
    })

    it('does not throw when json() rejects', async () => {
      fetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Invalid JSON')),
        })
      )

      // json() rejection is treated as retryable; advance past the retry delay
      const promise = geocodeWithRetry('Some Address')
      await vi.advanceTimersByTimeAsync(2000)

      // Second call also has bad json
      fetch.mockReturnValueOnce(
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new SyntaxError('Invalid JSON')),
        })
      )
      await vi.advanceTimersByTimeAsync(2000)

      await expect(promise).resolves.toBeNull()
    })
  })

  describe('maxRetries parameter', () => {
    it('does not retry when maxRetries is 0', async () => {
      fetch.mockReturnValueOnce(makeNetworkError())

      const result = await geocodeWithRetry('Some Address', 0)

      expect(result).toBeNull()
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })
})

// ---------------------------------------------------------------------------
// runGeocodingPass tests
// ---------------------------------------------------------------------------

// Mock the supabase module so tests don't need a real Supabase instance
vi.mock('../supabaseClient.js', () => {
  // We'll configure the mock's behaviour in each test via `supabase.__setMock`
  return {
    supabase: {
      // Default stub — overridden per test
      from: vi.fn(),
    },
  }
})

import { runGeocodingPass } from './geocodingEngine.js'
import { supabase } from '../supabaseClient.js'

// ---------------------------------------------------------------------------
// Supabase mock builder helpers
// ---------------------------------------------------------------------------

/**
 * Creates a chainable Supabase query builder stub that resolves to `result`
 * at the end of its chain.
 *
 * Supported chain: .select() .eq() .is() .single() .update()
 */
function makeQueryBuilder(result) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockReturnThis(),
    // When the chain ends without .single(), the builder itself is awaited
    then: (resolve) => resolve(result),
  }
  return builder
}

/**
 * Sets up `supabase.from` to respond to different table + level query patterns
 * using a map of mock implementations.
 *
 * @param {object} config
 * @param {object} config.phcFetch   result for .eq('level','phc').is('lat',null)
 * @param {object} config.hscFetch   result for .eq('level','hsc').is('lat',null)
 * @param {object} config.updateResult   result returned by .update().eq()
 * @param {object} [config.parentFetch]  result for parent PHC .single() lookup
 */
function setupSupabaseMock({ phcFetch, hscFetch, updateResult, parentFetch }) {
  supabase.from.mockImplementation((table) => {
    // Track call sequence per table so we can route the initial SELECT calls
    // for 'phc' and 'hsc' levels, and then UPDATE calls, separately.
    const callCount = supabase.from.mock.calls.filter(c => c[0] === table).length

    if (table === 'locations') {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn().mockReturnThis(),
      }

      // .is() is the terminal call for the initial SELECT queries.
      // We detect which query we're building via the accumulated .eq() args.
      builder.is.mockImplementation((_col, _val) => {
        // Check which .eq('level', ...) was called
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null

        if (level === 'phc') return Promise.resolve(phcFetch)
        if (level === 'hsc') return Promise.resolve(hscFetch)
        return Promise.resolve({ data: [], error: null })
      })

      // .single() is for the parent PHC lookup
      builder.single.mockResolvedValue(parentFetch ?? { data: null, error: null })

      // Terminal chain for UPDATE: .update(...).eq(...)
      // Make .eq() after .update() return the updateResult
      let afterUpdate = false
      const origUpdate = builder.update.bind(builder)
      builder.update = vi.fn((...args) => {
        afterUpdate = true
        origUpdate(...args)
        // Return a new builder whose .eq() resolves to updateResult
        return {
          eq: vi.fn().mockResolvedValue(updateResult ?? { data: null, error: null }),
        }
      })

      return builder
    }

    // Fallback for any other table
    return makeQueryBuilder({ data: null, error: null })
  })
}

// ---------------------------------------------------------------------------
// runGeocodingPass — describe block
// ---------------------------------------------------------------------------

describe('runGeocodingPass', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
    // Reset supabase.from call history before each test
    supabase.from.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Helper: advance past one rate-limit sleep (1000 ms) and any retry sleep (2000 ms)
  async function advancePastSleeps(count = 1, msEach = 1000) {
    for (let i = 0; i < count; i++) {
      await vi.advanceTimersByTimeAsync(msEach)
    }
  }

  // ---------------------------------------------------------------------------
  // Scenario A: all rows geocode successfully
  // ---------------------------------------------------------------------------
  it('increments geocoded count for each row that Nominatim resolves', async () => {
    const phcRow = { id: 1, level: 'phc', query_text: 'PHC A', parent_phc_id: null }
    const hscRow = { id: 2, level: 'hsc', query_text: 'HSC A', parent_phc_id: 1 }

    setupSupabaseMock({
      phcFetch: { data: [phcRow], error: null },
      hscFetch: { data: [hscRow], error: null },
      updateResult: { data: null, error: null },
    })

    // Both Nominatim calls return valid coords
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.0', lon: '80.0' }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.1', lon: '80.1' }]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    // Advance past both rate-limit sleeps
    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(result.geocoded).toBe(2)
    expect(result.fallback).toBe(0)
    expect(result.failed).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario B: HSC can't be geocoded, falls back to parent PHC coords
  // ---------------------------------------------------------------------------
  it('increments fallback count when HSC is unresolvable but parent PHC has coords', async () => {
    const phcRow = { id: 1, level: 'phc', query_text: 'PHC B', parent_phc_id: null }
    const hscRow = { id: 2, level: 'hsc', query_text: 'HSC B', parent_phc_id: 1 }

    // Build a specialized mock: PHC geocodes fine; HSC returns empty; parent lookup returns coords
    let fromCallIdx = 0
    supabase.from.mockImplementation(() => {
      fromCallIdx++
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: [phcRow], error: null })
        if (level === 'hsc') return Promise.resolve({ data: [hscRow], error: null })
        return Promise.resolve({ data: [], error: null })
      })

      // parent PHC coords lookup
      builder.single.mockResolvedValue({ data: { lat: 13.0, lng: 80.0 }, error: null })

      // UPDATE resolves immediately
      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    // PHC: success; HSC: empty
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.0', lon: '80.0' }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(result.geocoded).toBe(1)
    expect(result.fallback).toBe(1)
    expect(result.failed).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario C: HSC unresolvable, parent PHC also has no coords → failed
  // ---------------------------------------------------------------------------
  it('increments failed count when HSC and parent PHC are both unresolvable', async () => {
    const phcRow = { id: 1, level: 'phc', query_text: 'PHC C', parent_phc_id: null }
    const hscRow = { id: 2, level: 'hsc', query_text: 'HSC C', parent_phc_id: 1 }

    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: [phcRow], error: null })
        if (level === 'hsc') return Promise.resolve({ data: [hscRow], error: null })
        return Promise.resolve({ data: [], error: null })
      })

      // Parent PHC has no coords
      builder.single.mockResolvedValue({ data: { lat: null, lng: null }, error: null })

      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    // Both Nominatim calls return empty
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    await vi.advanceTimersByTimeAsync(2000)
    const result = await promise

    expect(result.geocoded).toBe(0)
    expect(result.fallback).toBe(0)
    expect(result.failed).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // Scenario D: HSC has no parent_phc_id → failed immediately
  // ---------------------------------------------------------------------------
  it('increments failed when HSC has null parent_phc_id', async () => {
    const hscRow = { id: 3, level: 'hsc', query_text: 'HSC D', parent_phc_id: null }

    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: [], error: null })
        if (level === 'hsc') return Promise.resolve({ data: [hscRow], error: null })
        return Promise.resolve({ data: [], error: null })
      })

      builder.single.mockResolvedValue({ data: null, error: null })
      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    await vi.advanceTimersByTimeAsync(1000)
    const result = await promise

    expect(result.failed).toBe(1)
    expect(result.geocoded).toBe(0)
    expect(result.fallback).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // Scenario E: onProgress is called once per row with correct arguments
  // ---------------------------------------------------------------------------
  it('calls onProgress(current, total) after each row', async () => {
    const rows = [
      { id: 1, level: 'phc', query_text: 'PHC E1', parent_phc_id: null },
      { id: 2, level: 'phc', query_text: 'PHC E2', parent_phc_id: null },
    ]

    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: rows, error: null })
        return Promise.resolve({ data: [], error: null })
      })

      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.0', lon: '80.0' }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.1', lon: '80.1' }]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })

  // ---------------------------------------------------------------------------
  // Scenario F: sleep(1000) is called between every request
  // ---------------------------------------------------------------------------
  it('enforces a 1000ms sleep after every Nominatim request', async () => {
    const phcRow = { id: 1, level: 'phc', query_text: 'PHC F', parent_phc_id: null }

    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: [phcRow], error: null })
        return Promise.resolve({ data: [], error: null })
      })

      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    fetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.0', lon: '80.0' }]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)

    // Before the 1000ms sleep elapses, onProgress shouldn't have been called yet
    // (progress is called AFTER sleep in our implementation; let's confirm the
    // pass isn't complete yet at t=999ms)
    await vi.advanceTimersByTimeAsync(999)
    expect(onProgress).not.toHaveBeenCalled()

    // After the full 1000ms sleep the pass completes
    await vi.advanceTimersByTimeAsync(1)
    await promise

    expect(onProgress).toHaveBeenCalledTimes(1)
  })

  // ---------------------------------------------------------------------------
  // Scenario G: sum of geocoded + fallback + failed === total (Req 13.5)
  // ---------------------------------------------------------------------------
  it('ensures geocoded + fallback + failed equals total rows processed', async () => {
    const phcRow = { id: 1, level: 'phc', query_text: 'PHC G1', parent_phc_id: null }
    const hscGeocodedRow = { id: 2, level: 'hsc', query_text: 'HSC G2', parent_phc_id: 1 }
    const hscFallbackRow = { id: 3, level: 'hsc', query_text: 'HSC G3', parent_phc_id: 1 }
    const hscFailedRow = { id: 4, level: 'hsc', query_text: 'HSC G4', parent_phc_id: null }

    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn(),
        update: vi.fn(),
      }

      builder.is.mockImplementation(() => {
        const eqCalls = builder.eq.mock.calls
        const levelCall = eqCalls.find(([col]) => col === 'level')
        const level = levelCall ? levelCall[1] : null
        if (level === 'phc') return Promise.resolve({ data: [phcRow], error: null })
        if (level === 'hsc') return Promise.resolve({ data: [hscGeocodedRow, hscFallbackRow, hscFailedRow], error: null })
        return Promise.resolve({ data: [], error: null })
      })

      // Parent PHC lookup: return coords (so fallback row can use them)
      builder.single.mockResolvedValue({ data: { lat: 13.0, lng: 80.0 }, error: null })

      builder.update.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      return builder
    })

    // PHC: success, HSC G2: success, HSC G3: empty (→ fallback), HSC G4: empty (→ failed, no parent)
    fetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.0', lon: '80.0' }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([{ lat: '13.1', lon: '80.1' }]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve([]) })

    const onProgress = vi.fn()
    const promise = runGeocodingPass(onProgress)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    const total = 4
    expect(result.geocoded + result.fallback + result.failed).toBe(total)
  })

  // ---------------------------------------------------------------------------
  // Scenario H: returns { geocoded:0, fallback:0, failed:0 } when no rows to process
  // ---------------------------------------------------------------------------
  it('returns zero counts and never calls onProgress when there are no ungeocoded rows', async () => {
    supabase.from.mockImplementation(() => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn(),
        update: vi.fn(),
      }
      return builder
    })

    const onProgress = vi.fn()
    const result = await runGeocodingPass(onProgress)

    expect(result).toEqual({ geocoded: 0, fallback: 0, failed: 0 })
    expect(onProgress).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})
