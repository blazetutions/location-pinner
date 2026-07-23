import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { applyFilters } from './applyFilters.js'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const ZONES = ['Chennai North', 'Chennai Central', 'Chennai South']
const BLOCKS = ['Ambattur', 'Sholinganallur', 'Perambur', 'Royapuram', 'Madhavaram']
const PHCS = ['PHC Alpha', 'PHC Beta', 'PHC Gamma']
const STATUSES = ['Visited', 'Not Visited', 'Follow-up Needed']

/** Arbitrary that generates a realistic LocationRow */
const locationArb = fc.record({
  id: fc.integer({ min: 1, max: 10_000 }),
  zone: fc.constantFrom(...ZONES),
  block: fc.constantFrom(...BLOCKS),
  phc: fc.constantFrom(...PHCS),
  level: fc.constantFrom('phc', 'hsc'),
  query_text: fc.string({ minLength: 1 }),
})

/** Arbitrary for a locations array with unique ids */
const uniqueLocationsArb = fc
  .array(locationArb, { minLength: 0, maxLength: 50 })
  .map(locs => {
    const seen = new Set()
    return locs.filter(loc => {
      if (seen.has(loc.id)) return false
      seen.add(loc.id)
      return true
    })
  })

/** Arbitrary for a FilterState with all-null/empty fields */
const emptyFilterArb = fc.constant({ zone: null, block: null, phc: null, statuses: [] })

/** Arbitrary for a FilterState that may have active filters */
const filterArb = fc.record({
  zone: fc.option(fc.constantFrom(...ZONES), { nil: null }),
  block: fc.option(fc.constantFrom(...BLOCKS), { nil: null }),
  phc: fc.option(fc.constantFrom(...PHCS), { nil: null }),
  statuses: fc.array(fc.constantFrom(...STATUSES), { minLength: 0, maxLength: 3 }),
})

/** Build a userStatuses Map from a locations array, randomly assigning statuses */
function buildUserStatuses(locations, statusAssignments) {
  const map = new Map()
  locations.forEach((loc, i) => {
    if (statusAssignments[i % statusAssignments.length] !== null) {
      map.set(loc.id, { status: statusAssignments[i % statusAssignments.length] })
    }
  })
  return map
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('applyFilters — unit tests', () => {
  const locations = [
    { id: 1, zone: 'Chennai North', block: 'Ambattur', phc: 'PHC Alpha', level: 'phc' },
    { id: 2, zone: 'Chennai North', block: 'Ambattur', phc: 'PHC Beta', level: 'phc' },
    { id: 3, zone: 'Chennai Central', block: 'Perambur', phc: 'PHC Alpha', level: 'hsc' },
    { id: 4, zone: 'Chennai South', block: 'Sholinganallur', phc: 'PHC Gamma', level: 'hsc' },
  ]

  it('empty filters return all locations unchanged', () => {
    const result = applyFilters(locations, new Map(), { zone: null, block: null, phc: null, statuses: [] })
    expect(result).toEqual(locations)
  })

  it('zone filter returns only locations in that zone', () => {
    const result = applyFilters(locations, new Map(), { zone: 'Chennai North', block: null, phc: null, statuses: [] })
    expect(result).toHaveLength(2)
    result.forEach(loc => expect(loc.zone).toBe('Chennai North'))
  })

  it('block filter returns only locations in that block', () => {
    const result = applyFilters(locations, new Map(), { zone: null, block: 'Ambattur', phc: null, statuses: [] })
    expect(result).toHaveLength(2)
    result.forEach(loc => expect(loc.block).toBe('Ambattur'))
  })

  it('phc filter returns only locations with that PHC name', () => {
    const result = applyFilters(locations, new Map(), { zone: null, block: null, phc: 'PHC Alpha', statuses: [] })
    expect(result).toHaveLength(2)
    result.forEach(loc => expect(loc.phc).toBe('PHC Alpha'))
  })

  it('zone + block filters combine with AND logic', () => {
    const result = applyFilters(locations, new Map(), { zone: 'Chennai North', block: 'Ambattur', phc: null, statuses: [] })
    expect(result).toHaveLength(2)
    result.forEach(loc => {
      expect(loc.zone).toBe('Chennai North')
      expect(loc.block).toBe('Ambattur')
    })
  })

  it('zone + block + phc combined narrows to exact match', () => {
    const result = applyFilters(locations, new Map(), { zone: 'Chennai North', block: 'Ambattur', phc: 'PHC Alpha', statuses: [] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('status filter keeps only locations whose effective status is in the list', () => {
    const statuses = new Map([[1, { status: 'Visited' }], [2, { status: 'Follow-up Needed' }]])
    // id 3 and 4 have no entry → default 'Not Visited'
    const result = applyFilters(locations, statuses, { zone: null, block: null, phc: null, statuses: ['Visited'] })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(1)
  })

  it('status filter defaults to Not Visited for locations with no UserStatusRow', () => {
    const statuses = new Map() // no entries
    const result = applyFilters(locations, statuses, { zone: null, block: null, phc: null, statuses: ['Not Visited'] })
    expect(result).toHaveLength(4) // all locations default to Not Visited
  })

  it('filter with no matching zone returns empty array', () => {
    const result = applyFilters(locations, new Map(), { zone: 'NoSuchZone', block: null, phc: null, statuses: [] })
    expect(result).toHaveLength(0)
  })

  it('does not mutate the input locations array', () => {
    const original = [...locations]
    applyFilters(locations, new Map(), { zone: 'Chennai North', block: null, phc: null, statuses: [] })
    expect(locations).toEqual(original)
  })

  it('does not mutate the input filter object', () => {
    const filters = { zone: 'Chennai North', block: null, phc: null, statuses: ['Visited'] }
    const filtersCopy = { ...filters, statuses: [...filters.statuses] }
    applyFilters(locations, new Map(), filters)
    expect(filters).toEqual(filtersCopy)
  })
})

// ---------------------------------------------------------------------------
// Property 4: Filter completeness
// Empty filters return full input array — no location is hidden when no filters are active.
// Validates: Requirements 7.1
// ---------------------------------------------------------------------------

describe('applyFilters — Property 4: Filter completeness', () => {
  it('empty filters always return the full input array', () => {
    fc.assert(
      fc.property(uniqueLocationsArb, emptyFilterArb, (locations, filters) => {
        const result = applyFilters(locations, new Map(), filters)
        // Must be the same length and contain the same items (reference equality)
        if (result.length !== locations.length) return false
        return locations.every(loc => result.includes(loc))
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 5: Filter soundness
// Every result satisfies all active filter conditions.
// Validates: Requirements 7.2, 7.3
// ---------------------------------------------------------------------------

describe('applyFilters — Property 5: Filter soundness', () => {
  it('every result satisfies all active filter conditions simultaneously', () => {
    const statusAssignmentArb = fc.array(
      fc.option(fc.constantFrom(...STATUSES), { nil: null }),
      { minLength: 1, maxLength: 10 }
    )

    fc.assert(
      fc.property(
        uniqueLocationsArb,
        filterArb,
        statusAssignmentArb,
        (locations, filters, statusAssignments) => {
          const userStatuses = buildUserStatuses(locations, statusAssignments)
          const result = applyFilters(locations, userStatuses, filters)

          return result.every(loc => {
            // Zone condition
            if (filters.zone != null && loc.zone !== filters.zone) return false
            // Block condition
            if (filters.block != null && loc.block !== filters.block) return false
            // PHC condition
            if (filters.phc != null && loc.phc !== filters.phc) return false
            // Status condition
            if (filters.statuses.length > 0) {
              const effectiveStatus = userStatuses.get(loc.id)?.status ?? 'Not Visited'
              if (!filters.statuses.includes(effectiveStatus)) return false
            }
            return true
          })
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property: result is always a subset of input (no mutation, no fabrication)
// Validates: Requirements 7.3, 7.4
// ---------------------------------------------------------------------------

describe('applyFilters — result is always a subset of input', () => {
  it('every item in the result is a reference found in the original input array', () => {
    fc.assert(
      fc.property(uniqueLocationsArb, filterArb, (locations, filters) => {
        const result = applyFilters(locations, new Map(), filters)
        // Every returned item must be reference-equal to something in the input
        return result.every(loc => locations.includes(loc))
      }),
      { numRuns: 200 }
    )
  })

  it('result length is always ≤ input length', () => {
    fc.assert(
      fc.property(uniqueLocationsArb, filterArb, (locations, filters) => {
        const result = applyFilters(locations, new Map(), filters)
        return result.length <= locations.length
      }),
      { numRuns: 200 }
    )
  })
})
