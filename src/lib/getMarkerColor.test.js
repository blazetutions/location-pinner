import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { getMarkerColor } from './getMarkerColor.js'

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('getMarkerColor — unit tests', () => {
  it("returns '#22c55e' for 'Visited'", () => {
    expect(getMarkerColor('Visited')).toBe('#22c55e')
  })

  it("returns '#f97316' for 'Follow-up Needed'", () => {
    expect(getMarkerColor('Follow-up Needed')).toBe('#f97316')
  })

  it("returns '#94a3b8' for 'Not Visited'", () => {
    expect(getMarkerColor('Not Visited')).toBe('#94a3b8')
  })

  it("returns '#94a3b8' for undefined", () => {
    expect(getMarkerColor(undefined)).toBe('#94a3b8')
  })
})

// ---------------------------------------------------------------------------
// Property 9: Marker color exhaustiveness
// For all valid status values and undefined, always returns a non-empty string.
// Validates: Requirements 5.1, 5.2, 5.3, 5.4
// ---------------------------------------------------------------------------

describe('getMarkerColor — Property 9: Marker color exhaustiveness', () => {
  it('always returns a non-empty string for every valid status value and undefined', () => {
    const statusArb = fc.constantFrom(
      'Visited',
      'Not Visited',
      'Follow-up Needed',
      undefined
    )

    fc.assert(
      fc.property(statusArb, (status) => {
        const color = getMarkerColor(status)
        return typeof color === 'string' && color.length > 0
      })
    )
  })
})
