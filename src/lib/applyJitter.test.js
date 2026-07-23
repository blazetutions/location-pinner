import { describe, it, expect } from 'vitest'
import { applyJitter } from './applyJitter.js'

const MIN_OFFSET = 0.0005
const MAX_OFFSET = 0.001

describe('applyJitter', () => {
  it('returns an object with lat and lng properties', () => {
    const result = applyJitter(13.0827, 80.2707)
    expect(result).toHaveProperty('lat')
    expect(result).toHaveProperty('lng')
  })

  it('output lat remains within WGS84 range [-90, 90] for typical Chennai coords', () => {
    for (let i = 0; i < 100; i++) {
      const { lat } = applyJitter(13.0827, 80.2707)
      expect(lat).toBeGreaterThanOrEqual(-90)
      expect(lat).toBeLessThanOrEqual(90)
    }
  })

  it('output lng remains within WGS84 range [-180, 180] for typical Chennai coords', () => {
    for (let i = 0; i < 100; i++) {
      const { lng } = applyJitter(13.0827, 80.2707)
      expect(lng).toBeGreaterThanOrEqual(-180)
      expect(lng).toBeLessThanOrEqual(180)
    }
  })

  it('output lat differs from input by between MIN_OFFSET and MAX_OFFSET (magnitude check)', () => {
    for (let i = 0; i < 200; i++) {
      const inputLat = 13.0827
      const { lat } = applyJitter(inputLat, 80.2707)
      const delta = Math.abs(lat - inputLat)
      expect(delta).toBeGreaterThanOrEqual(MIN_OFFSET)
      expect(delta).toBeLessThanOrEqual(MAX_OFFSET)
    }
  })

  it('output lng differs from input by between MIN_OFFSET and MAX_OFFSET (magnitude check)', () => {
    for (let i = 0; i < 200; i++) {
      const inputLng = 80.2707
      const { lng } = applyJitter(13.0827, inputLng)
      const delta = Math.abs(lng - inputLng)
      expect(delta).toBeGreaterThanOrEqual(MIN_OFFSET)
      expect(delta).toBeLessThanOrEqual(MAX_OFFSET)
    }
  })

  it('clamps jittered lat to +90 when input is at the north pole boundary', () => {
    // At lat=90 the jitter can only push toward 90 or just below; with positive sign
    // the raw value would exceed 90, so it must be clamped.
    // Run enough trials to hit a positive-sign case.
    let clampHit = false
    for (let i = 0; i < 500; i++) {
      const { lat } = applyJitter(90, 0)
      expect(lat).toBeLessThanOrEqual(90)
      if (lat === 90) clampHit = true
    }
    // With 500 trials and ~50% chance of positive sign, clamping should occur
    expect(clampHit).toBe(true)
  })

  it('clamps jittered lat to -90 when input is at the south pole boundary', () => {
    let clampHit = false
    for (let i = 0; i < 500; i++) {
      const { lat } = applyJitter(-90, 0)
      expect(lat).toBeGreaterThanOrEqual(-90)
      if (lat === -90) clampHit = true
    }
    expect(clampHit).toBe(true)
  })

  it('clamps jittered lng to +180 when input is at the eastern boundary', () => {
    let clampHit = false
    for (let i = 0; i < 500; i++) {
      const { lng } = applyJitter(0, 180)
      expect(lng).toBeLessThanOrEqual(180)
      if (lng === 180) clampHit = true
    }
    expect(clampHit).toBe(true)
  })

  it('clamps jittered lng to -180 when input is at the western boundary', () => {
    let clampHit = false
    for (let i = 0; i < 500; i++) {
      const { lng } = applyJitter(0, -180)
      expect(lng).toBeGreaterThanOrEqual(-180)
      if (lng === -180) clampHit = true
    }
    expect(clampHit).toBe(true)
  })

  it('produces both positive and negative offsets across many calls (non-deterministic sign)', () => {
    const deltas = []
    for (let i = 0; i < 200; i++) {
      const inputLat = 13.0827
      const { lat } = applyJitter(inputLat, 80.2707)
      deltas.push(lat - inputLat)
    }
    const hasPositive = deltas.some(d => d > 0)
    const hasNegative = deltas.some(d => d < 0)
    expect(hasPositive).toBe(true)
    expect(hasNegative).toBe(true)
  })
})
