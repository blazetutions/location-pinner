import { useTnceraGeocoding } from '../hooks/useTnceraGeocoding.jsx'

/**
 * TnceraGeocodingProgress — presentational component.
 *
 * Reads live geocoding state from TnceraGeocodingContext (via useTnceraGeocoding).
 * Safe to mount/unmount freely — does NOT own the geocoding pass or start it.
 * The pass is owned and started by useTnceraGeocoding / TnceraGeocodingProvider.
 *
 * Requirements: 4.3, 4.4, 4.8
 */
function TnceraGeocodingProgress() {
  const { status, estimatedCount, current, total, counts, failedRows } = useTnceraGeocoding()

  // Nothing to show when idle or when done with zero rows processed
  if (status === 'idle') return null
  if (status === 'done' && total === 0) return null

  const showEstimate = status === 'running' && estimatedCount !== null && current === 0
  const estimatedMinutes = estimatedCount !== null ? Math.ceil(estimatedCount / 60) : 0
  const remainingRows = total - current
  const minutesRemaining = Math.ceil(remainingRows / 60)

  return (
    <div
      className="geocoding-progress tncera-geocoding-progress"
      role="region"
      aria-label="TNCERA geocoding progress"
    >
      {/* Estimate warning — before processing starts (Req 4.3) */}
      {showEstimate && (
        <p className="tncera-geocoding-progress__estimate" role="note">
          This will geocode approximately {estimatedCount} location{estimatedCount !== 1 ? 's' : ''} at
          1 request/second — estimated {estimatedMinutes} minute{estimatedMinutes !== 1 ? 's' : ''}.
          You may close this tab and resume later.
        </p>
      )}

      {/* Live progress bar (Req 4.4) */}
      {status === 'running' && total > 0 && (
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
      {status === 'done' && total > 0 && (
        <p className="tncera-geocoding-progress__summary" role="status" aria-live="polite">
          Done: {counts.geocoded} geocoded, {counts.failed} failed
        </p>
      )}

      {/* Failed rows list (Req 4.8) */}
      {status === 'done' && failedRows.length > 0 && (
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
