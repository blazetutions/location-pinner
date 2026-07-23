import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildQueryText } from './buildQueryText.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal ExcelRow with the fields buildQueryText cares about. */
function makeRow({ phc = 'Test PHC', block = 'Test Block', hsc = 'Test HSC' } = {}) {
  return {
    'S.No': 1,
    'District': 'Chennai',
    'Hud Name': 'Chennai North',
    'Block Name': block,
    'Phc Name': phc,
    'Hsc Name': hsc,
  }
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('buildQueryText – unit tests', () => {
  it('returns the correct PHC format string', () => {
    const row = makeRow({ phc: 'Tondiarpet PHC', block: 'Tondiarpet' })
    expect(buildQueryText('phc', row)).toBe(
      'Tondiarpet PHC, Tondiarpet, Chennai, Tamil Nadu, India'
    )
  })

  it('returns the correct HSC format string', () => {
    const row = makeRow({ hsc: 'Royapuram HSC', phc: 'Tondiarpet PHC', block: 'Tondiarpet' })
    expect(buildQueryText('hsc', row)).toBe(
      'Royapuram HSC, Tondiarpet PHC, Tondiarpet, Chennai, Tamil Nadu, India'
    )
  })

  it('PHC query does not include the HSC name', () => {
    const row = makeRow({ hsc: 'Should Not Appear', phc: 'My PHC', block: 'My Block' })
    expect(buildQueryText('phc', row)).not.toContain('Should Not Appear')
  })

  it('HSC query contains all three name components', () => {
    const row = makeRow({ hsc: 'HSC A', phc: 'PHC B', block: 'Block C' })
    const result = buildQueryText('hsc', row)
    expect(result).toContain('HSC A')
    expect(result).toContain('PHC B')
    expect(result).toContain('Block C')
  })

  it('always ends with ", Chennai, Tamil Nadu, India" for PHC', () => {
    const row = makeRow()
    expect(buildQueryText('phc', row)).toMatch(/, Chennai, Tamil Nadu, India$/)
  })

  it('always ends with ", Chennai, Tamil Nadu, India" for HSC', () => {
    const row = makeRow()
    expect(buildQueryText('hsc', row)).toMatch(/, Chennai, Tamil Nadu, India$/)
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/** Arbitrary for a non-empty string (printable ASCII, no commas to keep assertions simple). */
const nonEmptyStr = fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0)

describe('buildQueryText – property tests', () => {
  /**
   * Validates: Requirements 12.1
   * PHC format is "{Phc Name}, {Block Name}, Chennai, Tamil Nadu, India"
   */
  it('Prop: PHC format matches specification exactly', () => {
    fc.assert(
      fc.property(nonEmptyStr, nonEmptyStr, (phc, block) => {
        const row = makeRow({ phc, block })
        const result = buildQueryText('phc', row)
        expect(result).toBe(`${phc}, ${block}, Chennai, Tamil Nadu, India`)
      })
    )
  })

  /**
   * Validates: Requirements 12.2
   * HSC format is "{Hsc Name}, {Phc Name}, {Block Name}, Chennai, Tamil Nadu, India"
   */
  it('Prop: HSC format matches specification exactly', () => {
    fc.assert(
      fc.property(nonEmptyStr, nonEmptyStr, nonEmptyStr, (hsc, phc, block) => {
        const row = makeRow({ hsc, phc, block })
        const result = buildQueryText('hsc', row)
        expect(result).toBe(`${hsc}, ${phc}, ${block}, Chennai, Tamil Nadu, India`)
      })
    )
  })

  /**
   * Validates: Requirements 12.3
   * Two rows that differ in any of {level, Hsc Name, Phc Name, Block Name}
   * must produce different query_text values.
   */
  it('Prop: different inputs produce different query texts (uniqueness)', () => {
    fc.assert(
      fc.property(
        nonEmptyStr, nonEmptyStr, nonEmptyStr,
        nonEmptyStr, nonEmptyStr, nonEmptyStr,
        (phc1, block1, hsc1, phc2, block2, hsc2) => {
          // Only test pairs that actually differ in at least one field
          fc.pre(phc1 !== phc2 || block1 !== block2 || hsc1 !== hsc2)

          const row1 = makeRow({ phc: phc1, block: block1, hsc: hsc1 })
          const row2 = makeRow({ phc: phc2, block: block2, hsc: hsc2 })

          // If data fields differ, the built strings must differ for the same level
          const hscText1 = buildQueryText('hsc', row1)
          const hscText2 = buildQueryText('hsc', row2)
          // PHC vs HSC always differs (different number of components)
          const phcText1 = buildQueryText('phc', row1)

          if (phc1 !== phc2 || block1 !== block2) {
            expect(buildQueryText('phc', row1)).not.toBe(buildQueryText('phc', row2))
          }
          if (hsc1 !== hsc2 || phc1 !== phc2 || block1 !== block2) {
            expect(hscText1).not.toBe(hscText2)
          }
          // PHC-level and HSC-level strings for the same row must always differ
          // (HSC string has one more component prepended)
          expect(phcText1).not.toBe(hscText1)
        }
      )
    )
  })

  /**
   * Validates: Requirements 12.4
   * buildQueryText is a pure function: identical inputs → identical outputs.
   */
  it('Prop: pure function – same inputs always return same output', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('phc', 'hsc'),
        nonEmptyStr, nonEmptyStr, nonEmptyStr,
        (level, phc, block, hsc) => {
          const row = makeRow({ phc, block, hsc })
          const first = buildQueryText(level, row)
          const second = buildQueryText(level, row)
          expect(first).toBe(second)
        }
      )
    )
  })

  /**
   * Validates: Requirements 12.1 & 12.2 (non-empty return)
   * buildQueryText always returns a non-empty string.
   */
  it('Prop: always returns a non-empty string', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('phc', 'hsc'),
        nonEmptyStr, nonEmptyStr, nonEmptyStr,
        (level, phc, block, hsc) => {
          const row = makeRow({ phc, block, hsc })
          const result = buildQueryText(level, row)
          expect(typeof result).toBe('string')
          expect(result.length).toBeGreaterThan(0)
        }
      )
    )
  })
})
