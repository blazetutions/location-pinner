/**
 * Applies a small random jitter to WGS84 coordinates.
 *
 * Each axis receives a uniform random offset in [0.0005, 0.001] degrees
 * with a random sign (±), corresponding to roughly 50–100 metres in
 * Chennai's latitude band.  Output is clamped to valid WGS84 ranges so
 * edge-of-world inputs never produce invalid coordinates.
 *
 * @param {number} lat - Input latitude in [-90, 90]
 * @param {number} lng - Input longitude in [-180, 180]
 * @returns {{ lat: number, lng: number }}
 */
export function applyJitter(lat, lng) {
  const MIN_OFFSET = 0.0005
  const MAX_OFFSET = 0.001

  // Random magnitude in [MIN_OFFSET, MAX_OFFSET]
  const latMagnitude = MIN_OFFSET + Math.random() * (MAX_OFFSET - MIN_OFFSET)
  const lngMagnitude = MIN_OFFSET + Math.random() * (MAX_OFFSET - MIN_OFFSET)

  // Random sign: -1 or +1
  const latSign = Math.random() < 0.5 ? -1 : 1
  const lngSign = Math.random() < 0.5 ? -1 : 1

  const jitteredLat = lat + latSign * latMagnitude
  const jitteredLng = lng + lngSign * lngMagnitude

  // Clamp to valid WGS84 ranges
  const clampedLat = Math.max(-90, Math.min(90, jitteredLat))
  const clampedLng = Math.max(-180, Math.min(180, jitteredLng))

  return { lat: clampedLat, lng: clampedLng }
}
