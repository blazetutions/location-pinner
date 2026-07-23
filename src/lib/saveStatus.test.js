import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the Supabase client
// vi.hoisted ensures these variables are initialised before the hoisted
// vi.mock() factory runs, which avoids the "Cannot access before initialisation"
// TDZ error.
// ---------------------------------------------------------------------------

const { mockSingle, mockSelect, mockUpsert, mockFrom, mockResult } = vi.hoisted(() => {
  const mockResult = { data: null, error: null }
  const mockSingle = vi.fn(() => Promise.resolve(mockResult))
  const mockSelect = vi.fn(() => ({ single: mockSingle }))
  const mockUpsert = vi.fn(() => ({ select: mockSelect }))
  const mockFrom = vi.fn(() => ({ upsert: mockUpsert }))
  return { mockSingle, mockSelect, mockUpsert, mockFrom, mockResult }
})

vi.mock('../supabaseClient.js', () => ({
  supabase: { from: mockFrom },
}))

import { saveStatus, VALID_STATUSES } from './saveStatus.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LOCATION_ID = 42
const USER_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff'

// Mutate the shared mockResult object in-place so mockSingle always resolves
// to the latest value (the object reference captured in vi.hoisted is stable).
function setMockSuccess(row) {
  mockResult.data = row
  mockResult.error = null
}

function setMockError(message) {
  mockResult.data = null
  mockResult.error = { message }
}

beforeEach(() => {
  // Clear call counts/args without wiping implementations
  mockFrom.mockClear()
  mockUpsert.mockClear()
  mockSelect.mockClear()
  mockSingle.mockClear()

  // Re-wire the chain in case a previous test overwrote an implementation
  mockFrom.mockImplementation(() => ({ upsert: mockUpsert }))
  mockUpsert.mockImplementation(() => ({ select: mockSelect }))
  mockSelect.mockImplementation(() => ({ single: mockSingle }))
  mockSingle.mockImplementation(() => Promise.resolve(mockResult))

  // Default: success with a representative row
  setMockSuccess({ id: 1, location_id: LOCATION_ID, user_id: USER_ID, status: 'Visited', note: null })
})

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('saveStatus — valid status values constant', () => {
  it('exports exactly the three permitted status strings', () => {
    expect(VALID_STATUSES).toEqual(['Visited', 'Not Visited', 'Follow-up Needed'])
  })
})

describe('saveStatus — success case', () => {
  it('returns { success: true, data } on a successful upsert', async () => {
    const row = { id: 7, location_id: LOCATION_ID, user_id: USER_ID, status: 'Visited', note: 'all good' }
    setMockSuccess(row)

    const result = await saveStatus(LOCATION_ID, USER_ID, 'Visited', 'all good')

    expect(result).toEqual({ success: true, data: row })
  })

  it('calls supabase.from with the correct table name', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Visited', null)
    expect(mockFrom).toHaveBeenCalledWith('user_location_status')
  })

  it('calls upsert with the correct payload and conflict key', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Follow-up Needed', 'check back')

    expect(mockUpsert).toHaveBeenCalledWith(
      { location_id: LOCATION_ID, user_id: USER_ID, status: 'Follow-up Needed', note: 'check back' },
      { onConflict: 'location_id,user_id' }
    )
  })

  it('chains .select().single() after upsert', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Not Visited', null)
    expect(mockSelect).toHaveBeenCalled()
    expect(mockSingle).toHaveBeenCalled()
  })
})

describe('saveStatus — invalid status rejection (Requirement 8.4)', () => {
  it('returns { success: false, error: "Invalid status value" } for an unknown status', async () => {
    const result = await saveStatus(LOCATION_ID, USER_ID, 'Pending', null)
    expect(result).toEqual({ success: false, error: 'Invalid status value' })
  })

  it('does NOT call the Supabase client when status is invalid', async () => {
    await saveStatus(LOCATION_ID, USER_ID, '', null)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it.each([
    ['visited'],         // wrong case
    ['VISITED'],
    ['not visited'],
    ['follow-up needed'],
    ['Unknown'],
    [null],
    [undefined],
    [123],
  ])('rejects status %s', async (badStatus) => {
    const result = await saveStatus(LOCATION_ID, USER_ID, badStatus, null)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid status value')
  })
})

describe('saveStatus — empty note coercion (Requirement 8.3)', () => {
  it('converts an empty string note to null before upserting', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Visited', '')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
      expect.any(Object)
    )
  })

  it('passes a non-empty note through unchanged', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Visited', 'some note')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'some note' }),
      expect.any(Object)
    )
  })

  it('passes null note through as null', async () => {
    await saveStatus(LOCATION_ID, USER_ID, 'Visited', null)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ note: null }),
      expect.any(Object)
    )
  })
})

describe('saveStatus — Supabase error handling (Requirement 8.6)', () => {
  it('returns { success: false, error: message } when Supabase returns an error', async () => {
    setMockError('duplicate key value violates unique constraint')

    const result = await saveStatus(LOCATION_ID, USER_ID, 'Visited', null)

    expect(result).toEqual({
      success: false,
      error: 'duplicate key value violates unique constraint',
    })
  })

  it('returns { success: false, error } for RLS violation', async () => {
    setMockError('new row violates row-level security policy')

    const result = await saveStatus(LOCATION_ID, USER_ID, 'Not Visited', null)

    expect(result.success).toBe(false)
    expect(result.error).toBe('new row violates row-level security policy')
  })

  it('does not throw; error is surfaced in the return value', async () => {
    setMockError('network error')

    await expect(saveStatus(LOCATION_ID, USER_ID, 'Follow-up Needed', null)).resolves.toMatchObject({
      success: false,
    })
  })
})

describe('saveStatus — all three valid statuses are accepted', () => {
  it.each(VALID_STATUSES)('accepts status "%s"', async (validStatus) => {
    const row = { location_id: LOCATION_ID, user_id: USER_ID, status: validStatus, note: null }
    setMockSuccess(row)

    const result = await saveStatus(LOCATION_ID, USER_ID, validStatus, null)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(row)
  })
})
