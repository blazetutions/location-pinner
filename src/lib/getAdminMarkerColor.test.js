import { describe, it, expect } from 'vitest'
import { getAdminMarkerColor } from './getAdminMarkerColor.js'

describe('getAdminMarkerColor', () => {
  it('returns grey for empty array', () => {
    expect(getAdminMarkerColor([])).toBe('#94a3b8')
  })

  it('returns grey for null or undefined input', () => {
    expect(getAdminMarkerColor(null)).toBe('#94a3b8')
    expect(getAdminMarkerColor(undefined)).toBe('#94a3b8')
  })

  it('returns grey when all statuses are Not Visited', () => {
    const input = [
      { status: 'Not Visited' },
      { status: 'Not Visited' },
      { status: 'Not Visited' },
    ]
    expect(getAdminMarkerColor(input)).toBe('#94a3b8')
  })

  it('returns green when any status is Visited', () => {
    const input = [{ status: 'Not Visited' }, { status: 'Visited' }]
    expect(getAdminMarkerColor(input)).toBe('#22c55e')
  })

  it('returns green when Visited is present along with Follow-up Needed', () => {
    const input = [
      { status: 'Follow-up Needed' },
      { status: 'Visited' },
      { status: 'Not Visited' },
    ]
    expect(getAdminMarkerColor(input)).toBe('#22c55e')
  })

  it('returns orange when any status is Follow-up Needed but none are Visited', () => {
    const input = [
      { status: 'Not Visited' },
      { status: 'Follow-up Needed' },
      { status: 'Not Visited' },
    ]
    expect(getAdminMarkerColor(input)).toBe('#f97316')
  })

  it('returns orange when all statuses are Follow-up Needed', () => {
    const input = [
      { status: 'Follow-up Needed' },
      { status: 'Follow-up Needed' },
    ]
    expect(getAdminMarkerColor(input)).toBe('#f97316')
  })

  it('returns grey for single Not Visited status', () => {
    const input = [{ status: 'Not Visited' }]
    expect(getAdminMarkerColor(input)).toBe('#94a3b8')
  })

  it('returns green for single Visited status', () => {
    const input = [{ status: 'Visited' }]
    expect(getAdminMarkerColor(input)).toBe('#22c55e')
  })

  it('returns orange for single Follow-up Needed status', () => {
    const input = [{ status: 'Follow-up Needed' }]
    expect(getAdminMarkerColor(input)).toBe('#f97316')
  })

  it('follows priority: Visited > Follow-up Needed > Not Visited', () => {
    // Visited wins
    const case1 = [
      { status: 'Visited' },
      { status: 'Follow-up Needed' },
      { status: 'Not Visited' },
    ]
    expect(getAdminMarkerColor(case1)).toBe('#22c55e')

    // Follow-up wins over Not Visited
    const case2 = [
      { status: 'Not Visited' },
      { status: 'Follow-up Needed' },
      { status: 'Not Visited' },
    ]
    expect(getAdminMarkerColor(case2)).toBe('#f97316')

    // All Not Visited
    const case3 = [{ status: 'Not Visited' }, { status: 'Not Visited' }]
    expect(getAdminMarkerColor(case3)).toBe('#94a3b8')
  })
})
