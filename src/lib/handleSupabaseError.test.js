import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleSupabaseError } from './handleSupabaseError.js'

// ---------------------------------------------------------------------------
// Unit tests — handleSupabaseError
// Validates: Requirement 9.5
// ---------------------------------------------------------------------------

describe('handleSupabaseError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  // ── RLS / permission errors ──────────────────────────────────────────────

  it('returns "Permission denied" when message contains "row-level security"', () => {
    const error = { message: 'new row violates row-level security policy for table "user_location_status"' }
    expect(handleSupabaseError(error)).toBe('Permission denied')
  })

  it('returns "Permission denied" when message contains "policy"', () => {
    const error = { message: 'violates policy on table locations' }
    expect(handleSupabaseError(error)).toBe('Permission denied')
  })

  it('returns "Permission denied" when message contains "permission denied"', () => {
    const error = { message: 'permission denied for table user_location_status' }
    expect(handleSupabaseError(error)).toBe('Permission denied')
  })

  it('returns "Permission denied" when message contains "violates row-level"', () => {
    const error = { message: 'violates row-level security' }
    expect(handleSupabaseError(error)).toBe('Permission denied')
  })

  it('is case-insensitive for RLS keywords', () => {
    const error = { message: 'Row-Level Security policy violated' }
    expect(handleSupabaseError(error)).toBe('Permission denied')
  })

  // ── Generic / non-RLS errors ─────────────────────────────────────────────

  it('returns generic message for a non-RLS error', () => {
    const error = { message: 'relation "locations" does not exist' }
    expect(handleSupabaseError(error)).toBe('An error occurred. Please try again.')
  })

  it('returns generic message for a network error', () => {
    const error = { message: 'FetchError: Failed to fetch' }
    expect(handleSupabaseError(error)).toBe('An error occurred. Please try again.')
  })

  it('returns generic message when error has no message property', () => {
    expect(handleSupabaseError({})).toBe('An error occurred. Please try again.')
  })

  it('returns generic message when error.message is undefined', () => {
    expect(handleSupabaseError({ message: undefined })).toBe('An error occurred. Please try again.')
  })

  it('returns generic message for null error', () => {
    expect(handleSupabaseError(null)).toBe('An error occurred. Please try again.')
  })

  // ── Side-effects ─────────────────────────────────────────────────────────

  it('logs the full error object to console.error', () => {
    const error = { message: 'some error', code: 'PGRST301', details: 'detail text' }
    handleSupabaseError(error)
    expect(console.error).toHaveBeenCalledWith('[Supabase Error]', error)
  })

  it('logs even for RLS errors', () => {
    const error = { message: 'permission denied' }
    handleSupabaseError(error)
    expect(console.error).toHaveBeenCalledWith('[Supabase Error]', error)
  })
})
