import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateColumns } from './validateColumns.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_COLUMNS = ['S.No', 'District', 'Hud Name', 'Block Name', 'Phc Name', 'Hsc Name']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a row object from a list of column names (values are irrelevant for column detection). */
function makeRows(columnNames) {
  if (columnNames.length === 0) return []
  const row = Object.fromEntries(columnNames.map(col => [col, 'value']))
  return [row]
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('validateColumns – unit tests', () => {
  it('returns valid=true and no missing columns when all 6 required columns are present', () => {
    const rows = makeRows(REQUIRED_COLUMNS)
    const result = validateColumns(rows)
    expect(result.valid).toBe(true)
    expect(result.missingColumns).toEqual([])
  })

  it('returns valid=false and all 6 missing columns when rows is an empty array', () => {
    const result = validateColumns([])
    expect(result.valid).toBe(false)
    expect(result.missingColumns).toEqual(REQUIRED_COLUMNS)
  })

  it('returns valid=false and lists one missing column when one required column is absent', () => {
    const cols = REQUIRED_COLUMNS.filter(c => c !== 'Hsc Name')
    const rows = makeRows(cols)
    const result = validateColumns(rows)
    expect(result.valid).toBe(false)
    expect(result.missingColumns).toContain('Hsc Name')
    expect(result.missingColumns).toHaveLength(1)
  })

  it('returns valid=false when all required columns are missing', () => {
    const rows = makeRows(['Unknown Col A', 'Unknown Col B'])
    const result = validateColumns(rows)
    expect(result.valid).toBe(false)
    expect(result.missingColumns).toEqual(REQUIRED_COLUMNS)
  })

  it('treats extra columns as acceptable — still valid if all required are present', () => {
    const cols = [...REQUIRED_COLUMNS, 'Extra Column', 'Another Extra']
    const rows = makeRows(cols)
    const result = validateColumns(rows)
    expect(result.valid).toBe(true)
    expect(result.missingColumns).toEqual([])
  })

  it('is case-sensitive — "hsc name" (lowercase) is not a valid substitute for "Hsc Name"', () => {
    const cols = REQUIRED_COLUMNS.filter(c => c !== 'Hsc Name').concat(['hsc name'])
    const rows = makeRows(cols)
    const result = validateColumns(rows)
    expect(result.valid).toBe(false)
    expect(result.missingColumns).toContain('Hsc Name')
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a subset of the required columns (guaranteed to be missing at least one).
 * Produces an array of column names that is a proper subset of REQUIRED_COLUMNS.
 */
const missingAtLeastOneRequiredArb = fc
  .subarray(REQUIRED_COLUMNS, { minLength: 0, maxLength: REQUIRED_COLUMNS.length - 1 })

/**
 * Arbitrary for additional (non-required) column names to add noise.
 */
const extraColArb = fc.array(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => !REQUIRED_COLUMNS.includes(s)),
  { minLength: 0, maxLength: 5 }
)

describe('validateColumns – property tests', () => {
  /**
   * Property 17: any header set missing ≥1 required column must return
   * valid = false and list every missing column name.
   *
   * Validates: Requirements 1.2, 1.3
   */
  it('Prop 17: any header set missing ≥1 required column returns valid=false and lists all missing columns', () => {
    fc.assert(
      fc.property(missingAtLeastOneRequiredArb, extraColArb, (presentRequired, extras) => {
        // Determine which required columns are absent
        const expectedMissing = REQUIRED_COLUMNS.filter(c => !presentRequired.includes(c))
        // expectedMissing.length >= 1 by construction of missingAtLeastOneRequiredArb

        const allCols = [...presentRequired, ...extras]
        const rows = makeRows(allCols)

        const result = validateColumns(rows)

        // 1. valid must be false
        expect(result.valid).toBe(false)

        // 2. Every missing required column must be listed
        for (const col of expectedMissing) {
          expect(result.missingColumns).toContain(col)
        }

        // 3. missingColumns must not contain columns that ARE present
        for (const col of presentRequired) {
          expect(result.missingColumns).not.toContain(col)
        }

        // 4. missingColumns length equals the number of absent required columns
        expect(result.missingColumns).toHaveLength(expectedMissing.length)
      }),
      { numRuns: 500 }
    )
  })

  /**
   * Complement property: when ALL required columns are present, valid must be true
   * and missingColumns must be empty — regardless of extra columns present.
   *
   * Validates: Requirements 1.2
   */
  it('Prop: when all required columns are present, valid=true and missingColumns=[]', () => {
    fc.assert(
      fc.property(extraColArb, (extras) => {
        const allCols = [...REQUIRED_COLUMNS, ...extras]
        const rows = makeRows(allCols)
        const result = validateColumns(rows)

        expect(result.valid).toBe(true)
        expect(result.missingColumns).toEqual([])
      }),
      { numRuns: 200 }
    )
  })

  /**
   * Empty-rows edge case: validateColumns([]) should always return all 6 required
   * columns as missing, regardless of how it is called.
   *
   * Validates: Requirements 1.2, 1.3
   */
  it('Prop: empty rows array always returns all 6 required columns as missing', () => {
    const result = validateColumns([])
    expect(result.valid).toBe(false)
    expect(result.missingColumns).toEqual(REQUIRED_COLUMNS)
  })
})
