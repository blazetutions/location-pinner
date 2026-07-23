import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase client — hoisted so the factory runs before vi.mock()
// ---------------------------------------------------------------------------

const { mockEq, mockSelect, mockUpsert, mockFrom, mockQueryResult } = vi.hoisted(() => {
  const mockQueryResult = { data: null, error: null }
  const mockEq = vi.fn(() => Promise.resolve(mockQueryResult))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  const mockUpsert = vi.fn(() => Promise.resolve(mockQueryResult))
  const mockFrom = vi.fn(() => ({ select: mockSelect, upsert: mockUpsert }))
  return { mockEq, mockSelect, mockUpsert, mockFrom, mockQueryResult }
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

function setExportSuccess(rows) {
  mockQueryResult.data = rows
  mockQueryResult.error = null
}

function setExportError(message) {
  mockQueryResult.data = null
  mockQueryResult.error = { message }
}

function setUpsertSuccess() {
  mockQueryResult.data = null
  mockQueryResult.error = null
}

function setUpsertError(message) {
  mockQueryResult.data = null
  mockQueryResult.error = { message }
}

beforeEach(() => {
  mockFrom.mockClear()
  mockSelect.mockClear()
  mockEq.mockClear()
  mockUpsert.mockClear()
  mockCreateObjectURL.mockClear()
  mockRevokeObjectURL.mockClear()
  mockClick.mockClear()

  // Re-wire the Supabase chain
  mockFrom.mockImplementation(() => ({ select: mockSelect, upsert: mockUpsert }))
  mockSelect.mockImplementation(() => ({ eq: mockEq }))
  mockEq.mockImplementation(() => Promise.resolve(mockQueryResult))
  mockUpsert.mockImplementation(() => Promise.resolve(mockQueryResult))

  // Mock document.createElement to intercept anchor creation
  mockCreateElement.mockImplementation((tag) => {
    if (tag === 'a') {
      return { href: '', download: '', click: mockClick }
    }
    // Fall through to real implementation for other tags
    return document.createElement.wrappedJSObject
      ? document.createElement.wrappedJSObject(tag)
      : Object.assign(Object.create(HTMLElement.prototype), { tagName: tag.toUpperCase() })
  })

  setExportSuccess([])
})

// ---------------------------------------------------------------------------
// exportUserData — success case
// ---------------------------------------------------------------------------

describe('exportUserData — successful export (Requirements 11.1, 11.2)', () => {
  it('returns a valid JSON string of the exported rows', async () => {
    const rows = [
      { location_id: 1, status: 'Visited', note: 'all good', updated_at: '2024-01-01' },
      { location_id: 2, status: 'Not Visited', note: null, updated_at: '2024-01-02' },
    ]
    setExportSuccess(rows)

    const result = await exportUserData(USER_ID)
    const parsed = JSON.parse(result)

    expect(parsed).toEqual(rows)
  })

  it('queries the correct table and filters by userId', async () => {
    setExportSuccess([])
    await exportUserData(USER_ID)

    expect(mockFrom).toHaveBeenCalledWith('user_location_status')
    expect(mockSelect).toHaveBeenCalledWith('location_id, status, note, updated_at')
    expect(mockEq).toHaveBeenCalledWith('user_id', USER_ID)
  })

  it('produces pretty-printed JSON with 2-space indent', async () => {
    const rows = [{ location_id: 5, status: 'Visited', note: null, updated_at: '2024-06-01' }]
    setExportSuccess(rows)

    const result = await exportUserData(USER_ID)

    expect(result).toBe(JSON.stringify(rows, null, 2))
  })

  it('every element in the exported array contains location_id, status, and note fields', async () => {
    const rows = [
      { location_id: 10, status: 'Follow-up Needed', note: 'revisit', updated_at: '2024-03-15' },
    ]
    setExportSuccess(rows)

    const result = await exportUserData(USER_ID)
    const parsed = JSON.parse(result)

    parsed.forEach((row) => {
      expect(row).toHaveProperty('location_id')
      expect(row).toHaveProperty('status')
      expect(row).toHaveProperty('note')
    })
  })
})

// ---------------------------------------------------------------------------
// exportUserData — download triggered
// ---------------------------------------------------------------------------

describe('exportUserData — browser download (Requirement 11.1)', () => {
  it('calls URL.createObjectURL to generate a blob URL', async () => {
    setExportSuccess([])
    await exportUserData(USER_ID)

    expect(mockCreateObjectURL).toHaveBeenCalledOnce()
  })

  it('calls URL.revokeObjectURL to clean up after download', async () => {
    setExportSuccess([])
    await exportUserData(USER_ID)

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('triggers a click on the anchor element to start the download', async () => {
    setExportSuccess([])
    await exportUserData(USER_ID)

    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('sets the filename to the correct pattern with today\'s date', async () => {
    setExportSuccess([])

    const anchor = { href: '', download: '', click: mockClick }
    mockCreateElement.mockImplementation((tag) => (tag === 'a' ? anchor : {}))

    await exportUserData(USER_ID)

    const today = new Date().toISOString().slice(0, 10)
    expect(anchor.download).toBe(`chennai-health-statuses-${today}.json`)
  })
})

// ---------------------------------------------------------------------------
// importUserData — success case
// ---------------------------------------------------------------------------

describe('importUserData — successful import (Requirements 11.4, 11.6)', () => {
  it('returns { upserted: N, errors: [] } when upsert succeeds', async () => {
    setUpsertSuccess()
    const rows = [
      { location_id: 1, status: 'Visited', note: null },
      { location_id: 2, status: 'Not Visited', note: 'pending' },
    ]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result).toEqual({ upserted: 2, errors: [] })
  })

  it('calls upsert with userId injected into every row', async () => {
    setUpsertSuccess()
    const rows = [{ location_id: 3, status: 'Follow-up Needed', note: null }]

    await importUserData(USER_ID, JSON.stringify(rows))

    expect(mockUpsert).toHaveBeenCalledWith(
      [{ location_id: 3, status: 'Follow-up Needed', note: null, user_id: USER_ID }],
      { onConflict: 'location_id,user_id' }
    )
  })

  it('uses the correct table name', async () => {
    setUpsertSuccess()
    await importUserData(USER_ID, JSON.stringify([{ location_id: 1, status: 'Visited' }]))

    expect(mockFrom).toHaveBeenCalledWith('user_location_status')
  })

  it('returns upserted count equal to number of rows in the import file', async () => {
    setUpsertSuccess()
    const rows = Array.from({ length: 5 }, (_, i) => ({ location_id: i + 1, status: 'Not Visited' }))

    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upserted).toBe(5)
    expect(result.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// importUserData — invalid JSON
// ---------------------------------------------------------------------------

describe('importUserData — invalid JSON (Requirement 11.3)', () => {
  it('returns an error and upserted=0 for malformed JSON without DB write', async () => {
    const result = await importUserData(USER_ID, 'not-valid-json{{{')

    expect(result.upserted).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('does not call Supabase when JSON is unparseable', async () => {
    await importUserData(USER_ID, '')

    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// importUserData — missing required fields (Requirement 11.3)
// ---------------------------------------------------------------------------

describe('importUserData — missing fields validation (Requirement 11.3)', () => {
  it('returns an error when the root value is not an array', async () => {
    const result = await importUserData(USER_ID, JSON.stringify({ location_id: 1, status: 'Visited' }))

    expect(result.upserted).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns an error when an element is missing location_id', async () => {
    const rows = [{ status: 'Visited', note: null }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upserted).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns an error when an element is missing status', async () => {
    const rows = [{ location_id: 5, note: 'something' }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upserted).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns an error when location_id is null', async () => {
    const rows = [{ location_id: null, status: 'Visited' }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upserted).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns an error when status is an empty string', async () => {
    const rows = [{ location_id: 1, status: '' }]
    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.upserted).toBe(0)
    expect(result.errors[0]).toMatch(/invalid import file/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// importUserData — Supabase error (Requirement 11.7)
// ---------------------------------------------------------------------------

describe('importUserData — Supabase error handling (Requirement 11.7)', () => {
  it('returns { upserted: 0, errors: [message] } on a Supabase error', async () => {
    setUpsertError('foreign key constraint violation')
    const rows = [{ location_id: 99, status: 'Visited' }]

    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result).toEqual({
      upserted: 0,
      errors: ['foreign key constraint violation'],
    })
  })

  it('includes the Supabase error message in the errors array', async () => {
    setUpsertError('RLS policy violation')
    const rows = [{ location_id: 1, status: 'Not Visited' }]

    const result = await importUserData(USER_ID, JSON.stringify(rows))

    expect(result.errors).toContain('RLS policy violation')
  })

  it('does not throw; Supabase errors are surfaced in the return value', async () => {
    setUpsertError('network timeout')
    const rows = [{ location_id: 1, status: 'Visited' }]

    await expect(importUserData(USER_ID, JSON.stringify(rows))).resolves.toMatchObject({
      upserted: 0,
    })
  })
})
