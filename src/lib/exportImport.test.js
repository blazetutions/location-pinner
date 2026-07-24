import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase client — hoisted so the factory runs before vi.mock()
// ---------------------------------------------------------------------------

const {
  mockEqPhc,
  mockEqTncera,
  mockSelectPhc,
  mockSelectTncera,
  mockUpsertPhc,
  mockUpsertTncera,
  mockFrom,
  mockPhcQueryResult,
  mockTnceraQueryResult,
} = vi.hoisted(() => {
  const mockPhcQueryResult = { data: null, error: null }
  const mockTnceraQueryResult = { data: null, error: null }

  const mockEqPhc = vi.fn(() => Promise.resolve(mockPhcQueryResult))
  const mockEqTncera = vi.fn(() => Promise.resolve(mockTnceraQueryResult))
  const mockSelectPhc = vi.fn(() => ({ eq: mockEqPhc }))
  const mockSelectTncera = vi.fn(() => ({ eq: mockEqTncera }))
  const mockUpsertPhc = vi.fn(() => Promise.resolve(mockPhcQueryResult))
  const mockUpsertTncera = vi.fn(() => Promise.resolve(mockTnceraQueryResult))

  const mockFrom = vi.fn((table) => {
    if (table === 'user_tncera_status') {
      return { select: mockSelectTncera, upsert: mockUpsertTncera }
    }
    // Default: user_location_status (PHC/HSC)
    return { select: mockSelectPhc, upsert: mockUpsertPhc }
  })

  return {
    mockEqPhc,
    mockEqTncera,
    mockSelectPhc,
    mockSelectTncera,
    mockUpsertPhc,
    mockUpsertTncera,
    mockFrom,
    mockPhcQueryResult,
    mockTnceraQueryResult,
  }
})

vi.mock('../supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}))

// ---------------------------------------------------------------------------
// Mock browser APIs
// ---------------------------------------------------------------------------

const mockClick = vi.fn()
const mockCreateElement = vi.spyOn(document, 'createElement')
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()

Object.defineProperty(globalThis, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
})

import { exportUserData, importUserData } from './exportImport.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-uuid-1234'

function setPhcSuccess(rows) {
  mockPhcQueryResult.data = rows
  mockPhcQueryResult.error = null
}

function setTnceraSuccess(rows) {
  mockTnceraQueryResult.data = rows
  mockTnceraQueryResult.error = null
}

function setPhcError(message) {
  mockPhcQueryResult.data = null
  mockPhcQueryResult.error = { message }
}

function setTnceraError(message) {
  mockTnceraQueryResult.data = null
  mockTnceraQueryResult.error = { message }
}

beforeEach(() => {
  mockFrom.mockClear()
  mockSelectPhc.mockClear()
  mockSelectTncera.mockClear()
  mockEqPhc.mockClear()
  mockEqTncera.mockClear()
  mockUpsertPhc.mockClear()
  mockUpsertTncera.mockClear()
  mockCreateObjectURL.mockClear()
  mockRevokeObjectURL.mockClear()
  mockClick.mockClear()

  // Re-wire the Supabase chain
  mockFrom.mockImplementation((table) => {
    if (table === 'user_tncera_status') {
      return { select: mockSelectTncera, upsert: mockUpsertTncera }
    }
    return { select: mockSelectPhc, upsert: mockUpsertPhc }
  })
  mockSelectPhc.mockImplementation(() => ({ eq: mockEqPhc }))
  mockSelectTncera.mockImplementation(() => ({ eq: mockEqTncera }))
  mockEqPhc.mockImplementation(() => Promise.resolve(mockPhcQueryResult))
  mockEqTncera.mockImplementation(() => Promise.resolve(mockTnceraQueryResult))
  mockUpsertPhc.mockImplementation(() => Promise.resolve(mockPhcQueryResult))
  mockUpsertTncera.mockImplementation(() => Promise.resolve(mockTnceraQueryResult))

  // Mock document.createElement to intercept anchor creation
  mockCreateElement.mockImplementation((tag) => {
    if (tag === 'a') {
      return { href: '', download: '', click: mockClick }
    }
    return Object.assign(Object.create(HTMLElement.prototype), { tagName: tag.toUpperCase() })
  })

  setPhcSuccess([])
  setTnceraSuccess([])
})

// ---------------------------------------------------------------------------
// exportUserData — structure (Requirements 9.1, 9.2)
// ---------------------------------------------------------------------------

describe('exportUserData — combined JSON structure (Requirements 9.1, 9.2)', () => {
  it('returns JSON with phc_hsc and tncera keys when both tables have rows (Req 9.1)', async () => {
    const phcRows = [{ location_id: 1, status: 'Visited', note: null, updated_at: '2024-01-01' }]
    const tnceraRows = [{ location_id: 'a1', status: 'Converted', note: null, updated_at: '2024-01-02' }]
    setPhcSuccess(phcRows)
    setTnceraSuccess(tnceraRows)

    const result = await exportUserData(USER_ID)
    const parsed = JSON.parse(result)

    expect(parsed).toEqual({ phc_hsc: phcRows, tncera: tnceraRows })
  })

  it('returns tncera: [] when only PHC/HSC rows exist (Req 9.2)', async () => {
    const phcRows = [{ location_id: 2, status: 'Visited', note: 'ok', updated_at: '2024-02-01' }]
    setPhcSuccess(phcRows)
    setTnceraSuccess([])

    const result = await exportUserData(USER_ID)
    const parsed = JSON.parse(result)

    expect(parsed.phc_hsc).toEqual(phcRows)
    expect(parsed.tncera).toEqual([])
  })

  it('queries both user_location_status and user_tncera_status in parallel', async () => {
    setPhcSuccess([])
    setTnceraSuccess([])

    await exportUserData(USER_ID)

    expect(mockFrom).toHaveBeenCalledWith('user_location_status')
    expect(mockFrom).toHaveBeenCalledWith('user_tncera_status')
  })

  it('filters both queries by userId', async () => {
    await exportUserData(USER_ID)

    expect(mockEqPhc).toHaveBeenCalledWith('user_id', USER_ID)
    expect(mockEqTncera).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('produces pretty-printed JSON with 2-space indent', async () => {
    const phcRows = [{ location_id: 5, status: 'Visited', note: null, updated_at: '2024-06-01' }]
    setPhcSuccess(phcRows)
    setTnceraSuccess([])

    const result = await exportUserData(USER_ID)
    const expected = JSON.stringify({ phc_hsc: phcRows, tncera: [] }, null, 2)

    expect(result).toBe(expected)
  })

  it('every element in each exported array contains location_id and status', async () => {
    const phcRows = [{ location_id: 10, status: 'Visited', note: 'note', updated_at: '2024-03-15' }]
    const tnceraRows = [{ location_id: 'b2', status: 'Pending', note: null, updated_at: '2024-03-16' }]
    setPhcSuccess(phcRows)
    setTnceraSuccess(tnceraRows)

    const result = await exportUserData(USER_ID)
    const parsed = JSON.parse(result)

    ;[...parsed.phc_hsc, ...parsed.tncera].forEach((row) => {
      expect(row).toHaveProperty('location_id')
      expect(row).toHaveProperty('status')
    })
  })

  it('throws when the PHC/HSC query fails', async () => {
    setPhcError('connection error')
    setTnceraSuccess([])

    await expect(exportUserData(USER_ID)).rejects.toThrow('connection error')
  })

  it('throws when the TNCERA query fails', async () => {
    setPhcSuccess([])
    setTnceraError('permission denied')

    await expect(exportUserData(USER_ID)).rejects.toThrow('permission denied')
  })
})

// ---------------------------------------------------------------------------
// exportUserData — download triggered
// ---------------------------------------------------------------------------

describe('exportUserData — browser download', () => {
  it('calls URL.createObjectURL to generate a blob URL', async () => {
    await exportUserData(USER_ID)
    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
  })

  it('calls URL.revokeObjectURL to clean up after download', async () => {
    await exportUserData(USER_ID)
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('triggers a click on the anchor element to start the download', async () => {
    await exportUserData(USER_ID)
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('sets the filename to tn-health-statuses-{YYYY-MM-DD}.json', async () => {
    const anchor = { href: '', download: '', click: mockClick }
    mockCreateElement.mockImplementation((tag) => (tag === 'a' ? anchor : {}))

    await exportUserData(USER_ID)

    const today = new Date().toISOString().slice(0, 10)
    expect(anchor.download).toBe(`tn-health-statuses-${today}.json`)
  })
})

// ---------------------------------------------------------------------------
// importUserData — legacy plain-array path (Requirement 9.5)
// ---------------------------------------------------------------------------

describe('importUserData — legacy plain array (Requirement 9.5)', () => {
  it('returns { upsertedPhcHsc: N, upsertedTncera: 0, errors: [] } for a plain array', async () => {
    const rows = [
      { location_id: 1, status: 'Visited', note: null },
      { location_id: 2, status: 'Pending', note: 'check' },
    ]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result).toEqual({ upsertedPhcHsc: 2, upsertedTncera: 0, errors: [] })
  })

  it('upserts only to user_location_status — no writes to user_tncera_status', async () => {
    const rows = [{ location_id: 3, status: 'Visited', note: null }]
    await importUserData(USER_ID, JSON.stringify(rows))

    expect(mockUpsertPhc).toHaveBeenCalledOnce()
    expect(mockUpsertTncera).not.toHaveBeenCalled()
  })

  it('injects userId into every row', async () => {
    const rows = [{ location_id: 3, status: 'Visited', note: null }]
    await importUserData(USER_ID, JSON.stringify(rows))

    expect(mockUpsertPhc).toHaveBeenCalledWith(
      [{ location_id: 3, status: 'Visited', note: null, user_id: USER_ID }],
      { onConflict: 'location_id,user_id' }
    )
  })

  it('returns a validation error for a plain array with a missing location_id', async () => {
    const rows = [{ status: 'Visited' }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upsertedPhcHsc).toBe(0)
    expect(result.upsertedTncera).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
  })

  it('returns a validation error for a plain array with an empty status', async () => {
    const rows = [{ location_id: 1, status: '' }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.errors).toHaveLength(1)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
  })

  it('returns an error when the Supabase upsert fails', async () => {
    mockPhcQueryResult.error = { message: 'foreign key constraint violation' }
    const rows = [{ location_id: 99, status: 'Visited' }]

    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result).toEqual({
      upsertedPhcHsc: 0,
      upsertedTncera: 0,
      errors: ['foreign key constraint violation'],
    })
  })
})

// ---------------------------------------------------------------------------
// importUserData — combined object path (Requirements 9.3, 9.4)
// ---------------------------------------------------------------------------

describe('importUserData — combined object format (Requirements 9.3, 9.4)', () => {
  it('upserts phc_hsc to user_location_status and tncera to user_tncera_status', async () => {
    const phcRows = [{ location_id: 1, status: 'Visited' }]
    const tnceraRows = [{ location_id: 'a1', status: 'Converted' }]
    const payload = { phc_hsc: phcRows, tncera: tnceraRows }

    const result = await importUserData(USER_ID, JSON.stringify(payload))

    expect(result).toEqual({ upsertedPhcHsc: 1, upsertedTncera: 1, errors: [] })
    expect(mockUpsertPhc).toHaveBeenCalledWith(
      [{ location_id: 1, status: 'Visited', user_id: USER_ID }],
      { onConflict: 'location_id,user_id' }
    )
    expect(mockUpsertTncera).toHaveBeenCalledWith(
      [{ location_id: 'a1', status: 'Converted', user_id: USER_ID }],
      { onConflict: 'location_id,user_id' }
    )
  })

  it('returns correct per-table counts (Requirement 9.7)', async () => {
    const phcRows = Array.from({ length: 3 }, (_, i) => ({ location_id: i + 1, status: 'Visited' }))
    const tnceraRows = Array.from({ length: 2 }, (_, i) => ({ location_id: `t${i}`, status: 'Pending' }))

    const result = await importUserData(USER_ID, JSON.stringify({ phc_hsc: phcRows, tncera: tnceraRows }))

    expect(result.upsertedPhcHsc).toBe(3)
    expect(result.upsertedTncera).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('handles an object with only phc_hsc key (tncera defaults to [])', async () => {
    const phcRows = [{ location_id: 5, status: 'Pending' }]
    const result = await importUserData(USER_ID, JSON.stringify({ phc_hsc: phcRows }))

    expect(result.upsertedPhcHsc).toBe(1)
    expect(result.upsertedTncera).toBe(0)
    expect(result.errors).toHaveLength(0)
    expect(mockUpsertTncera).not.toHaveBeenCalled()
  })

  it('handles an object with only tncera key (phc_hsc defaults to [])', async () => {
    const tnceraRows = [{ location_id: 'x1', status: 'Visited' }]
    const result = await importUserData(USER_ID, JSON.stringify({ tncera: tnceraRows }))

    expect(result.upsertedPhcHsc).toBe(0)
    expect(result.upsertedTncera).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
  })

  it('aborts with error if phc_hsc array has invalid element — no writes (Requirement 9.3)', async () => {
    const payload = {
      phc_hsc: [{ status: 'Visited' }], // missing location_id
      tncera: [{ location_id: 'a1', status: 'Pending' }],
    }
    const result = await importUserData(USER_ID, JSON.stringify(payload))

    expect(result.upsertedPhcHsc).toBe(0)
    expect(result.upsertedTncera).toBe(0)
    expect(result.errors[0]).toMatch(/phc_hsc/i)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
    expect(mockUpsertTncera).not.toHaveBeenCalled()
  })

  it('aborts with error if tncera array has invalid element — no writes (Requirement 9.3)', async () => {
    const payload = {
      phc_hsc: [{ location_id: 1, status: 'Visited' }],
      tncera: [{ location_id: null, status: 'Pending' }], // null location_id
    }
    const result = await importUserData(USER_ID, JSON.stringify(payload))

    expect(result.upsertedPhcHsc).toBe(0)
    expect(result.upsertedTncera).toBe(0)
    expect(result.errors[0]).toMatch(/tncera/i)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
    expect(mockUpsertTncera).not.toHaveBeenCalled()
  })

  it('surfaces a Supabase error from the PHC/HSC upsert', async () => {
    mockPhcQueryResult.error = { message: 'RLS violation on user_location_status' }
    const payload = {
      phc_hsc: [{ location_id: 1, status: 'Visited' }],
      tncera: [{ location_id: 'a1', status: 'Pending' }],
    }
    const result = await importUserData(USER_ID, JSON.stringify(payload))

    expect(result.errors).toContain('RLS violation on user_location_status')
  })

  it('surfaces a Supabase error from the TNCERA upsert', async () => {
    mockTnceraQueryResult.error = { message: 'RLS violation on user_tncera_status' }
    const payload = {
      phc_hsc: [{ location_id: 1, status: 'Visited' }],
      tncera: [{ location_id: 'a1', status: 'Pending' }],
    }
    const result = await importUserData(USER_ID, JSON.stringify(payload))

    expect(result.errors).toContain('RLS violation on user_tncera_status')
  })
})

// ---------------------------------------------------------------------------
// importUserData — invalid JSON
// ---------------------------------------------------------------------------

describe('importUserData — invalid JSON', () => {
  it('returns an error and zeros for malformed JSON without DB write', async () => {
    const result = await importUserData(USER_ID, 'not-valid-json{{{')

    expect(result.upsertedPhcHsc).toBe(0)
    expect(result.upsertedTncera).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsertPhc).not.toHaveBeenCalled()
    expect(mockUpsertTncera).not.toHaveBeenCalled()
  })

  it('does not call Supabase when JSON is unparseable', async () => {
    await importUserData(USER_ID, '')

    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// importUserData — unrecognised format
// ---------------------------------------------------------------------------

describe('importUserData — unrecognised format', () => {
  it('returns an error for a top-level number', async () => {
    const result = await importUserData(USER_ID, '42')

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/unrecognised format/i)
  })

  it('returns an error for a top-level string', async () => {
    const result = await importUserData(USER_ID, '"hello"')

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/unrecognised format/i)
  })
})
