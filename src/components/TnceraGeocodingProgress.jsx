import { useState, useEffect, useRef } from 'react'
import { runTnceraGeocodingPass } from '../lib/tnceraGeocodingEngine'

/**
 * TnceraGeocodingProgress component
 *
 * Displays an estimate warning before geocoding begins, automatically triggers
 * the TNCERA geocoding pass when tnceraRows changes, shows live progress with a
 * <progress> element and time-remaining label, and lists failed rows (with
 * facility_name and address_text) after the pass completes.
 *
 * Requirements: 4.3, 4.4, 4.8
 *
 * @param {{
 *   tnceraRows: object[],
 *   onGeocodingComplete: () => void
 * }} props
 */
function TnceraGeocodingProgress({ tnceraRows, onGeocodingComplete }) {
  const [estimatedCount, setEstimatedCount] = useState(null)
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(false)
  const [counts, setCounts] = useState({ geocoded: 0, failed: 0 })
  const [failedRows, setFailedRows] = useState([])
  const hasStartedRef = useRef(false)

  useEffect(() => {
    // Reset state when tnceraRows changes
    hasStartedRef.current = false
    setEstimatedCount(null)
    setDone(false)
    setCurrent(0)
    setTotal(0)
    setCounts({ geocoded: 0, failed: 0 })
    setFailedRows([])

    async function startGeocoding() {
      if (hasStartedRef.current) return
      hasStartedRef.current = true

      const result = await runTnceraGeocodingPass({
        onEstimate: (count) => {
          setEstimatedCount(count)
          setTotal(count)
        },
        onProgress: (curr, tot) => {
          setCurrent(curr)
          setTotal(tot)
        },
      })

      const totalProcessed = result.geocoded + result.failed
      if (totalProcessed === 0) {
        setTotal(0)
        setDone(true)
        onGeocodingComplete()
        return
      }

      setCounts({ geocoded: result.geocoded, failed: result.failed })
      setFailedRows(result.failedRows || [])
      setDone(true)
      onGeocodingComplete()
    }

    if (tnceraRows && tnceraRows.length > 0) {
      startGeocoding()
    }
  }, [tnceraRows, onGeocodingComplete])

  // If no rows were processed (total === 0 after finishing), render nothing
  if (done && total === 0) {
    return null
  }

  // Estimate warning: shown before geocoding starts (estimatedCount set by onEstimate,
  // but current is still 0 and pass hasn't progressed yet)
  const showEstimate = estimatedCount !== null && !done
  const estimatedMinutes = estimatedCount !== null ? Math.ceil(estimatedCount / 60) : 0

  // Time remaining during active pass
  const remainingRows = total - current
  const minutesRemaining = Math.ceil(remainingRows / 60)

  return (
    <div
      className="geocoding-progress tncera-geocoding-progress"
      role="region"
      aria-label="TNCERA geocoding progress"
    >
      {/* Estimate warning — shown before the pass begins processing rows (Req 4.3) */}
      {showEstimate && current === 0 && (
        <p className="tncera-geocoding-progress__estimate" role="note">
          This will geocode approximately {estimatedCount} location{estimatedCount !== 1 ? 's' : ''} at
          1 request/second — estimated {estimatedMinutes} minute{estimatedMinutes !== 1 ? 's' : ''}.
          You may close this tab and resume later.
        </p>
      )}

      {/* Live progress bar and label (Req 4.4) */}
      {!done && total > 0 && (
        <>
          <progress
            value={current}
            max={total}
            aria-label={`TNCERA geocoding progress: ${current} of ${total} locations processed`}
          >
            {current} / {total}
          </progress>
          <p aria-live="polite" aria-atomic="true">
            Geocoding {current} / {total}
            {remainingRows > 0 && ` — ~${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} remaining`}
          </p>
        </>
      )}

      {/* Completion summary */}
      {done && total > 0 && (
        <p
          className="tncera-geocoding-progress__summary"
          role="status"
          aria-live="polite"
        >
          Done: {counts.geocoded} geocoded, {counts.failed} failed
        </p>
      )}

      {/* Failed rows list (Req 4.8) */}
      {done && failedRows.length > 0 && (
        <div
          className="tncera-geocoding-progress__failed"
          role="region"
          aria-label="Failed TNCERA geocoding rows"
        >
          <p>The following locations could not be geocoded:</p>
          <ul>
            {failedRows.map((row, index) => (
              <li key={index}>
                <strong>{row.facility_name}</strong>
                {row.address_text && ` — ${row.address_text}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default TnceraGeocodingProgress
