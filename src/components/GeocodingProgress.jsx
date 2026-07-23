import { useState, useEffect, useRef } from 'react'
import { runGeocodingPass } from '../lib/geocodingEngine'

/**
 * GeocodingProgress component
 *
 * Automatically triggers geocoding when locationRows changes, displays progress
 * with a <progress> element, shows estimated time remaining, and displays a
 * completion summary when finished.
 *
 * Requirements: 2.7, 2.8
 *
 * @param {{
 *   locationRows: object[],
 *   onGeocodingComplete: () => void
 * }} props
 */
function GeocodingProgress({ locationRows, onGeocodingComplete }) {
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(false)
  const [counts, setCounts] = useState({ geocoded: 0, fallback: 0, failed: 0 })
  const hasStartedRef = useRef(false)

  useEffect(() => {
    // Reset and start geocoding when locationRows changes
    hasStartedRef.current = false
    setDone(false)
    setCurrent(0)
    setTotal(0)
    setCounts({ geocoded: 0, fallback: 0, failed: 0 })

    async function startGeocoding() {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      // Run the geocoding pass with progress callback
      const result = await runGeocodingPass((curr, tot) => {
        setCurrent(curr)
        setTotal(tot)
      })

      // Check if there were actually rows to geocode
      const totalProcessed = result.geocoded + result.fallback + result.failed
      if (totalProcessed === 0) {
        // No rows were processed — set total to 0 so component renders nothing
        setTotal(0)
        setDone(true)
        // Still notify parent that geocoding is "complete"
        onGeocodingComplete()
        return
      }

      // Geocoding finished — update final counts and mark done
      setCounts(result)
      setDone(true)
      onGeocodingComplete()
    }

    if (locationRows && locationRows.length > 0) {
      startGeocoding()
    }
  }, [locationRows, onGeocodingComplete])

  // If no rows were geocoded (total === 0 after starting), render nothing
  if (done && total === 0) {
    return null
  }

  // Calculate estimated time remaining (1 second per row)
  const remainingRows = total - current
  const estimatedMinutes = Math.ceil(remainingRows / 60)

  return (
    <div
      className="geocoding-progress"
      role="region"
      aria-label="Geocoding progress"
    >
      {!done && (
        <>
          <progress
            value={current}
            max={total}
            aria-label={`Geocoding progress: ${current} of ${total} rows processed`}
          >
            {current} / {total}
          </progress>
          <p aria-live="polite" aria-atomic="true">
            Geocoding: {current} of {total} rows processed
            {remainingRows > 0 && ` — ~${estimatedMinutes} minute${estimatedMinutes !== 1 ? 's' : ''} remaining`}
          </p>
        </>
      )}

      {done && total > 0 && (
        <p
          className="geocoding-progress__summary"
          role="status"
          aria-live="polite"
        >
          Done: {counts.geocoded} geocoded, {counts.fallback} fallback, {counts.failed} failed
        </p>
      )}
    </div>
  )
}

export default GeocodingProgress
